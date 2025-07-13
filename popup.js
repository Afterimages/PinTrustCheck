// 弹出窗口脚本
document.addEventListener('DOMContentLoaded', () => {
  initializePopup();
});

// 初始化弹出窗口
function initializePopup() {
  // 绑定链接事件
  bindLinkEvents();
  
  // 检查当前状态
  checkCurrentStatus();
  
  console.log('PinTrustCheck 弹出窗口已加载');
}

// 绑定链接事件
function bindLinkEvents() {
  const feedbackLink = document.getElementById('feedback-link');
  const helpLink = document.getElementById('help-link');
  
  if (feedbackLink) {
    feedbackLink.addEventListener('click', (e) => {
      e.preventDefault();
      openFeedbackPage();
    });
  }
  
  if (helpLink) {
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      openHelpPage();
    });
  }
}

// 打开反馈页面
function openFeedbackPage() {
  // 这里可以链接到您的反馈渠道
  const feedbackUrl = 'https://github.com/your-username/pintrust-check/issues';
  chrome.tabs.create({ url: feedbackUrl });
}

// 打开帮助页面
function openHelpPage() {
  // 这里可以链接到您的帮助文档
  const helpUrl = 'https://github.com/your-username/pintrust-check/wiki';
  chrome.tabs.create({ url: helpUrl });
}

// 检查当前状态
async function checkCurrentStatus() {
  try {
    // 检查是否有活跃的BOSS直聘标签页
    const tabs = await chrome.tabs.query({ url: "https://*.zhipin.com/*" });
    
    if (tabs.length > 0) {
      updateStatus('已检测到BOSS直聘页面', 'success');
    } else {
      updateStatus('请访问BOSS直聘页面使用插件', 'info');
    }
    
    // 检查企业预警通登录状态
    const loginResponse = await chrome.runtime.sendMessage({
      action: 'checkQccLogin'
    });
    
    if (loginResponse.isLoggedIn) {
      updateStatus('企业预警通已登录', 'success');
    } else {
      updateStatus('请先登录企业预警通', 'warning');
    }
    
  } catch (error) {
    console.error('检查状态失败:', error);
    updateStatus('状态检查失败', 'error');
  }
}

// 更新状态显示
function updateStatus(message, type = 'info') {
  // 这里可以添加状态显示逻辑
  console.log(`状态: ${message} (${type})`);
}

// 添加键盘快捷键监听
document.addEventListener('keydown', (event) => {
  // Ctrl+Shift+P 快捷键
  if (event.ctrlKey && event.shiftKey && event.key === 'P') {
    event.preventDefault();
    showShortcutInfo();
  }
});

// 显示快捷键信息
function showShortcutInfo() {
  // 创建临时提示
  const tooltip = document.createElement('div');
  tooltip.className = 'shortcut-tooltip';
  tooltip.textContent = '快捷键已激活！请在BOSS直聘页面选中公司名称后使用。';
  tooltip.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #333;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  document.body.appendChild(tooltip);
  
  setTimeout(() => {
    if (tooltip.parentNode) {
      tooltip.remove();
    }
  }, 3000);
}

// 添加使用统计
function trackUsage(action) {
  // 这里可以添加使用统计逻辑
  console.log(`用户操作: ${action}`);
  
  // 存储到本地存储
  chrome.storage.local.get(['usage_stats'], (result) => {
    const stats = result.usage_stats || {};
    stats[action] = (stats[action] || 0) + 1;
    stats.last_used = new Date().toISOString();
    
    chrome.storage.local.set({ usage_stats: stats });
  });
}

// 导出函数供其他脚本使用
window.pintrustPopup = {
  trackUsage,
  updateStatus,
  checkCurrentStatus
}; 