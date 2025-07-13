// 后台服务工作者
chrome.runtime.onInstalled.addListener(() => {
  console.log('PinTrustCheck 插件已安装');
});

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkQccLogin') {
    // 检查企业预警通登录状态
    checkQccLoginStatus().then(isLoggedIn => {
      sendResponse({ isLoggedIn });
    });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'searchCompany') {
    // 搜索公司信息
    searchCompanyInfo(request.companyName).then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === 'extractCompanyData') {
    // 提取公司数据
    extractCompanyData().then(data => {
      sendResponse(data);
    });
    return true;
  }
});

// 检查企业预警通登录状态
async function checkQccLoginStatus() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.qcc.com/*" });
    if (tabs.length === 0) {
      return false;
    }
    
    // 在第一个企业预警通标签页中执行检查
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        // 检查是否存在登录相关的元素
        const loginElements = document.querySelectorAll('.user-name, .user-info, [data-login="true"]');
        const logoutElements = document.querySelectorAll('.logout, .sign-out');
        
        // 如果有登录元素且没有登出元素，则认为已登录
        return loginElements.length > 0 && logoutElements.length === 0;
      }
    });
    
    return result[0].result;
  } catch (error) {
    console.error('检查登录状态失败:', error);
    return false;
  }
}

// 搜索公司信息
async function searchCompanyInfo(companyName) {
  try {
    // 检查是否已有企业预警通标签页
    let tabs = await chrome.tabs.query({ url: "https://*.qcc.com/*" });
    
    if (tabs.length === 0) {
      // 创建新的企业预警通标签页
      const newTab = await chrome.tabs.create({
        url: `https://www.qcc.com/web/search?key=${encodeURIComponent(companyName)}`
      });
      tabs = [newTab];
    } else {
      // 在现有标签页中搜索
      await chrome.tabs.update(tabs[0].id, {
        url: `https://www.qcc.com/web/search?key=${encodeURIComponent(companyName)}`
      });
    }
    
    return { success: true, tabId: tabs[0].id };
  } catch (error) {
    console.error('搜索公司失败:', error);
    return { success: false, error: error.message };
  }
}

// 提取公司数据
async function extractCompanyData() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.qcc.com/*" });
    if (tabs.length === 0) {
      return { success: false, error: '未找到企业预警通页面' };
    }
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        // 提取公司基本信息
        const companyData = {};
        
        // 公司名称
        const nameElement = document.querySelector('.company-name, .title, h1');
        if (nameElement) {
          companyData.name = nameElement.textContent.trim();
        }
        
        // 成立日期
        const establishElement = document.querySelector('[data-key="成立日期"], .establish-date, .reg-date');
        if (establishElement) {
          companyData.establishDate = establishElement.textContent.trim();
        }
        
        // 实缴资本
        const capitalElement = document.querySelector('[data-key="实缴资本"], .paid-capital, .capital');
        if (capitalElement) {
          companyData.paidCapital = capitalElement.textContent.trim();
        }
        
        // 人员规模
        const staffElement = document.querySelector('[data-key="人员规模"], .staff-size, .employee-count');
        if (staffElement) {
          companyData.staffSize = staffElement.textContent.trim();
        }
        
        // 参保人数
        const insuranceElement = document.querySelector('[data-key="参保人数"], .insurance-count, .social-insurance');
        if (insuranceElement) {
          companyData.insuranceCount = insuranceElement.textContent.trim();
        }
        
        // 注册资本
        const regCapitalElement = document.querySelector('[data-key="注册资本"], .reg-capital');
        if (regCapitalElement) {
          companyData.regCapital = regCapitalElement.textContent.trim();
        }
        
        // 经营状态
        const statusElement = document.querySelector('[data-key="经营状态"], .business-status, .status');
        if (statusElement) {
          companyData.businessStatus = statusElement.textContent.trim();
        }
        
        return companyData;
      }
    });
    
    return { success: true, data: result[0].result };
  } catch (error) {
    console.error('提取公司数据失败:', error);
    return { success: false, error: error.message };
  }
} 