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
    // 1. 跳转到企业预警通首页或已有tab
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
          element.value = value;
          const event = new Event('input', { bubbles: true });
          const tracker = element._valueTracker;
          if (tracker) {
            tracker.setValue(lastValue);
          }
          element.dispatchEvent(event);
        }
        try {
          // 选择placeholder包含公司和关键字的input.ant-input[type=text]
          const input = Array.from(document.querySelectorAll('input.ant-input[type="text"]')).find(i => i.placeholder && i.placeholder.includes('公司') && i.placeholder.includes('关键字'));
          if (!input) {
            return;
          }
          input.removeAttribute('readonly');
          input.focus();
          input.click();
          setNativeValue(input, companyName);
          input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: companyName[companyName.length-1] }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: companyName[companyName.length-1] }));
          setTimeout(() => {
            try {
              const autoBox = document.querySelector('.securities__SecuritiesBox-fiIjFR');
              if (autoBox) {
                const items = autoBox.querySelectorAll('.securities-search-item');
              }
            } catch (e) {}
          }, 800);
        } catch (e) {}
      },
      args: [companyName]
    });

    // 4. 等待补全列表出现
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('[PinTrustCheck] 等待补全列表出现，准备点击第一个补全项');

    // 5. 注入脚本：点击第一个补全项
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const autoBox = document.querySelector('.securities__SecuritiesBox-fiIjFR');
          if (autoBox) {
            const items = autoBox.querySelectorAll('.securities-search-item');
            if (items.length > 0) {
              try {
                items[0].click();
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    });

    // 6. 等待页面跳转到详情页
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('[PinTrustCheck] 操作完成，等待详情页加载');

    return { success: true, tabId };
  } catch (error) {
    console.error('[PinTrustCheck] 搜索公司失败:', error, error && error.stack);
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
        // 智能等待员工人数元素出现再抓取，最多等5秒
        function getTextByLabel(label) {
          const start = Date.now();
          return new Promise(resolve => {
            function tryFind() {
              const li = Array.from(document.querySelectorAll('li')).find(li => li.querySelector('.label') && li.querySelector('.label').innerText.replace(/\s|：/g, '') === label);
              if (li) {
                // 兼容不同结构
                const ellipse = li.querySelector('.ellipse');
                if (ellipse) return resolve(ellipse.innerText.trim());
                const labelContent = li.querySelector('.labelContent');
                if (labelContent) return resolve(labelContent.innerText.trim());
                const copyVal = li.querySelector('.copy-val');
                if (copyVal) return resolve(copyVal.innerText.trim());
                const text = li.querySelector('.text');
                if (text) return resolve(text.innerText.trim());
                // 直接li下span
                const span = li.querySelector('span:not(.label)');
                if (span) return resolve(span.innerText.trim());
                return resolve(li.innerText.replace(/^.*?：/, '').trim());
              }
              if (Date.now() - start > 5000) return resolve(''); // 最多等5秒
              setTimeout(tryFind, 100);
            }
            tryFind();
          });
        }
         // 智能等待公司名称出现
         function getCompanyName() {
           const start = Date.now();
           return new Promise(resolve => {
             function tryFind() {
               const nameEl = document.querySelector('.titleWrapper .name.copy-val');
               if (nameEl) return resolve(nameEl.innerText.trim());
               if (Date.now() - start > 5000) return resolve('');
               setTimeout(tryFind, 100);
             }
             tryFind();
           });
         }
         // 用Promise.all并行提取
         return Promise.all([
           getCompanyName(),
           getTextByLabel('成立日期'),
           getTextByLabel('实缴资本'),
           getTextByLabel('企业规模'),
           getTextByLabel('员工人数').then(val => val || getTextByLabel('参保人数'))
         ]).then(([name, establishDate, paidCapital, staffSize, insuranceCount]) => ({
           name,
           establishDate,
           paidCapital,
           staffSize,
           insuranceCount
         }));
      },
      // 需要指定返回Promise
      world: 'MAIN'
    });
    // 由于脚本返回Promise，需取result[0].result
    return { success: true, data: result[0].result };
  } catch (error) {
    console.error('[PinTrustCheck] 提取公司数据失败:', error, error && error.stack);
    return { success: false, error: error.message };
  }
} 