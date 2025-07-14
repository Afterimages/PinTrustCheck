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

// 注册原生右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pintrust-check-company",
    title: "查询企业信息",
    contexts: ["selection"], // 只在选中文本时显示
    documentUrlPatterns: ["https://*.zhipin.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pintrust-check-company") {
    chrome.tabs.sendMessage(tab.id, {
      action: "processCompanyInfo",
      companyName: info.selectionText
    });
  }
});

// 检查企业预警通登录状态
async function checkQccLoginStatus() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.qyyjt.cn/*" });
    if (tabs.length === 0) {
      return false;
    }
    // 在第一个企业预警通标签页中执行检查
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        // 只有存在个人头像结构时才判定为已登录
        return !!document.querySelector('.ant-dropdown-trigger .avatar__Wrapper-dsigLm .topBarAvatar');
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
    console.log('[PinTrustCheck] 开始搜索公司:', companyName);
    // 1. 跳转到企业预警通首页
    let tabs = await chrome.tabs.query({ url: "https://*.qyyjt.cn/*" });
    let tabId;
    if (tabs.length === 0) {
      const newTab = await chrome.tabs.create({ url: "https://www.qyyjt.cn/" });
      tabId = newTab.id;
      console.log('[PinTrustCheck] 新建标签页:', tabId);
    } else {
      await chrome.tabs.update(tabs[0].id, { url: "https://www.qyyjt.cn/" });
      tabId = tabs[0].id;
      console.log('[PinTrustCheck] 复用已有标签页:', tabId);
    }

    // 2. 等待首页加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('[PinTrustCheck] 首页加载完毕，准备注入搜索脚本');

    // 3. 注入脚本：兼容所有placeholder含公司和关键字的搜索框
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (companyName) => {
        function setNativeValue(element, value) {
          const lastValue = element.value;
          console.log('[PinTrustCheck] setNativeValue: lastValue=', lastValue, 'newValue=', value);
          element.value = value;
          const event = new Event('input', { bubbles: true });
          const tracker = element._valueTracker;
          console.log('[PinTrustCheck] setNativeValue: tracker=', tracker);
          if (tracker) {
            tracker.setValue(lastValue);
            console.log('[PinTrustCheck] setNativeValue: tracker.setValue done');
          }
          element.dispatchEvent(event);
          console.log('[PinTrustCheck] setNativeValue: dispatched input event', event);
        }
        console.log('[PinTrustCheck] 注入脚本：setNativeValue输入');
        // 选择placeholder包含公司和关键字的input.ant-input[type=text]
        const input = Array.from(document.querySelectorAll('input.ant-input[type="text"]')).find(i => i.placeholder && i.placeholder.includes('公司') && i.placeholder.includes('关键字'));
        console.log('[PinTrustCheck] input元素:', input);
        if (!input) {
          console.log('[PinTrustCheck] 未找到公司搜索框');
          return;
        }
        input.removeAttribute('readonly');
        input.focus();
        input.click();
        setNativeValue(input, companyName);
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: companyName[companyName.length-1] }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: companyName[companyName.length-1] }));
        console.log('[PinTrustCheck] setNativeValue已填充:', input.value);
        setTimeout(() => {
          const autoBox = document.querySelector('.securities__SecuritiesBox-fiIjFR');
          console.log('[PinTrustCheck] 补全列表容器:', autoBox);
          if (autoBox) {
            const items = autoBox.querySelectorAll('.securities-search-item');
            console.log('[PinTrustCheck] 补全项数量:', items.length, items);
          }
        }, 800);
      },
      args: [companyName]
    });

    // 4. 等待补全列表出现
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('[PinTrustCheck] 等待补全列表出现，准备点击第一个补全项');

    // 5. 注入脚本：点击第一个补全项，并打印所有补全项
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        console.log('[PinTrustCheck] 注入脚本：点击第一个补全项');
        const autoBox = document.querySelector('.securities__SecuritiesBox-fiIjFR');
        console.log('[PinTrustCheck] 补全列表容器:', autoBox);
        if (autoBox) {
          const items = autoBox.querySelectorAll('.securities-search-item');
          console.log('[PinTrustCheck] 补全项数量:', items.length, items);
          if (items.length > 0) {
            items[0].click();
            console.log('[PinTrustCheck] 已点击第一个补全项');
          } else {
            console.log('[PinTrustCheck] 没有补全项可点');
          }
        } else {
          console.log('[PinTrustCheck] 没有补全列表容器');
        }
      }
    });

    // 6. 等待页面跳转到详情页
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('[PinTrustCheck] 操作完成，等待详情页加载');

    return { success: true, tabId };
  } catch (error) {
    console.error('[PinTrustCheck] 搜索公司失败:', error);
    return { success: false, error: error.message };
  }
}

// 提取公司数据
async function extractCompanyData() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://*.qyyjt.cn/*" });
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