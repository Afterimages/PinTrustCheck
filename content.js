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
  const startTime = Date.now(); // 计时开始
  showNotification('正在检查登录状态...', 'info');
  
  try {
    const loginResponse = await chrome.runtime.sendMessage({
      action: 'checkQccLogin'
    });
    
    if (!loginResponse.isLoggedIn) {
      showNotification('请先登录企业预警通', 'warning');
      window.open('https://www.qyyjt.cn/user/login', '_blank');
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
      
      const endTime = Date.now(); // 计时结束
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      if (dataResponse.success) {
        showCompanyInfo(dataResponse.data, companyName, duration);
      } else {
        showNotification('数据提取失败: ' + dataResponse.error + `（耗时${duration}秒）`, 'error');
      }
      
      isProcessing = false;
    }, 1200);
    
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.error('处理公司信息失败:', error);
    showNotification('处理失败: ' + error.message + `（耗时${duration}秒）`, 'error');
    isProcessing = false;
  }
}

// 显示公司信息浮窗
function showCompanyInfo(companyData, originalName, duration) {
  if (floatingWindow) {
    floatingWindow.remove();
  }
  
  const windowDiv = document.createElement('div');
  windowDiv.className = 'pintrust-floating-window';
  windowDiv.innerHTML = `
    <div class="window-header" style="cursor: move;">
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
        ${companyData.paidCapital ? `<div class="info-item">
          <span class="info-label">实缴资本:</span>
          <span class="info-value">${companyData.paidCapital}</span>
        </div>` : ''}
        <div class="info-item">
          <span class="info-label">员工人数:</span>
          <span class="info-value">${companyData.insuranceCount ? companyData.insuranceCount : '--'}</span>
        </div>
        ${companyData.staffSize ? `<div class="info-item">
          <span class="info-label">企业规模:</span>
          <span class="info-value">${companyData.staffSize}</span>
        </div>` : ''}
      </div>
      <div class="disclaimer">
        <small>⚠️ 免责声明：本插件仅在用户登录授权后运行，信息展示仅作参考</small>
      </div>
      <div style="margin-top:8px;text-align:right;color:#888;font-size:12px;">本次查询耗时：${duration}秒</div>
    </div>
  `;
  
  // 初始位置，靠近屏幕右侧
  const windowWidth = 400;
  const windowHeight = 300;
  const margin = 32;
  windowDiv.style.left = (window.innerWidth - windowWidth - margin) + 'px';
  windowDiv.style.top = margin + 'px';
  windowDiv.style.position = 'fixed';
  windowDiv.style.transform = 'none'; // 禁用原有transform，方便拖拽

  document.body.appendChild(windowDiv);
  floatingWindow = windowDiv;

  // 拖拽逻辑
  const header = windowDiv.querySelector('.window-header');
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('mousedown', function(e) {
    isDragging = true;
    // 鼠标点到浮窗左上角的偏移
    const rect = windowDiv.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  function onDragMove(e) {
    if (!isDragging) return;
    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;
    // 限制浮窗不超出窗口
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - windowDiv.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - windowDiv.offsetHeight));
    windowDiv.style.left = newLeft + 'px';
    windowDiv.style.top = newTop + 'px';
  }

  function onDragEnd() {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  }

  // 自动关闭逻辑
  setTimeout(() => {
    if (windowDiv.parentNode) {
      windowDiv.remove();
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