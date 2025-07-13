// 内容脚本 - 处理页面交互
let selectedText = '';
let floatingWindow = null;
let isProcessing = false;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initializePlugin();
});

// 插件初始化
function initializePlugin() {
  addContextMenu();
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keydown', handleKeyboardEvents);
  console.log('PinTrustCheck 内容脚本已加载');
}

// 处理文本选择
function handleTextSelection(event) {
  const selection = window.getSelection();
  if (selection.toString().trim()) {
    selectedText = selection.toString().trim();
  }
}

// 处理键盘事件
function handleKeyboardEvents(event) {
  if (event.ctrlKey && event.shiftKey && event.key === 'P') {
    event.preventDefault();
    if (selectedText) {
      processCompanyInfo(selectedText);
    } else {
      showNotification('请先选中公司名称', 'warning');
    }
  }
}

// 添加右键菜单
function addContextMenu() {
  document.addEventListener('contextmenu', (event) => {
    const selection = window.getSelection();
    if (selection.toString().trim()) {
      selectedText = selection.toString().trim();
      createContextMenu(event);
      event.preventDefault();
    }
  });
}

// 创建右键菜单
function createContextMenu(event) {
  const existingMenu = document.getElementById('pintrust-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  const menu = document.createElement('div');
  menu.id = 'pintrust-menu';
  menu.className = 'pintrust-context-menu';
  menu.innerHTML = `
    <div class="menu-item" onclick="window.pintrustCheckCompany('${selectedText}')">
      <span class="menu-icon">🔍</span>
      查询企业信息
    </div>
    <div class="menu-item" onclick="window.pintrustCopyCompany('${selectedText}')">
      <span class="menu-icon">📋</span>
      复制公司名
    </div>
  `;
  
  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  
  document.body.appendChild(menu);
  
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true });
  }, 100);
}

// 关闭右键菜单
function closeContextMenu() {
  const menu = document.getElementById('pintrust-menu');
  if (menu) {
    menu.remove();
  }
}

// 暴露给全局的函数
window.pintrustCheckCompany = function(companyName) {
  closeContextMenu();
  processCompanyInfo(companyName);
};

window.pintrustCopyCompany = function(companyName) {
  closeContextMenu();
  navigator.clipboard.writeText(companyName).then(() => {
    showNotification('公司名称已复制到剪贴板', 'success');
  });
};

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processCompanyInfo" && request.companyName) {
    processCompanyInfo(request.companyName);
  }
});

// 处理公司信息查询
async function processCompanyInfo(companyName) {
  if (isProcessing) {
    showNotification('正在处理中，请稍候...', 'info');
    return;
  }
  
  isProcessing = true;
  showNotification('正在检查登录状态...', 'info');
  
  try {
    const loginResponse = await chrome.runtime.sendMessage({
      action: 'checkQccLogin'
    });
    
    if (!loginResponse.isLoggedIn) {
      showNotification('请先登录企业预警通', 'warning');
      window.open('https://www.qcc.com/web/login', '_blank');
      isProcessing = false;
      return;
    }
    
    showNotification('正在搜索公司信息...', 'info');
    
    const searchResponse = await chrome.runtime.sendMessage({
      action: 'searchCompany',
      companyName: companyName
    });
    
    if (!searchResponse.success) {
      showNotification('搜索失败: ' + searchResponse.error, 'error');
      isProcessing = false;
      return;
    }
    
    setTimeout(async () => {
      showNotification('正在提取公司数据...', 'info');
      
      const dataResponse = await chrome.runtime.sendMessage({
        action: 'extractCompanyData'
      });
      
      if (dataResponse.success) {
        showCompanyInfo(dataResponse.data, companyName);
      } else {
        showNotification('数据提取失败: ' + dataResponse.error, 'error');
      }
      
      isProcessing = false;
    }, 2000);
    
  } catch (error) {
    console.error('处理公司信息失败:', error);
    showNotification('处理失败: ' + error.message, 'error');
    isProcessing = false;
  }
}

// 显示公司信息浮窗
function showCompanyInfo(companyData, originalName) {
  if (floatingWindow) {
    floatingWindow.remove();
  }
  
  const window = document.createElement('div');
  window.className = 'pintrust-floating-window';
  window.innerHTML = `
    <div class="window-header">
      <div class="window-title">
        <span class="title-icon">🏢</span>
        企业信息查询结果
      </div>
      <div class="window-close" onclick="this.parentElement.parentElement.remove()">×</div>
    </div>
    <div class="window-content">
      <div class="company-name">${companyData.name || originalName}</div>
      <div class="info-grid">
        ${companyData.establishDate ? `<div class="info-item">
          <span class="info-label">成立日期:</span>
          <span class="info-value">${companyData.establishDate}</span>
        </div>` : ''}
        ${companyData.regCapital ? `<div class="info-item">
          <span class="info-label">注册资本:</span>
          <span class="info-value">${companyData.regCapital}</span>
        </div>` : ''}
        ${companyData.paidCapital ? `<div class="info-item">
          <span class="info-label">实缴资本:</span>
          <span class="info-value">${companyData.paidCapital}</span>
        </div>` : ''}
        ${companyData.staffSize ? `<div class="info-item">
          <span class="info-label">人员规模:</span>
          <span class="info-value">${companyData.staffSize}</span>
        </div>` : ''}
        ${companyData.insuranceCount ? `<div class="info-item">
          <span class="info-label">参保人数:</span>
          <span class="info-value">${companyData.insuranceCount}</span>
        </div>` : ''}
        ${companyData.businessStatus ? `<div class="info-item">
          <span class="info-label">经营状态:</span>
          <span class="info-value">${companyData.businessStatus}</span>
        </div>` : ''}
      </div>
      <div class="disclaimer">
        <small>⚠️ 免责声明：本插件仅在用户登录授权后运行，信息展示仅作参考</small>
      </div>
    </div>
  `;
  
  const mouseX = window.event ? window.event.clientX : 100;
  const mouseY = window.event ? window.event.clientY : 100;
  
  window.style.left = Math.min(mouseX, window.innerWidth - 400) + 'px';
  window.style.top = Math.min(mouseY, window.innerHeight - 300) + 'px';
  
  document.body.appendChild(window);
  floatingWindow = window;
  
  setTimeout(() => {
    if (window.parentNode) {
      window.remove();
    }
  }, 30000);
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `pintrust-notification pintrust-notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
} 