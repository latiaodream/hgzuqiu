# 皇冠账号自动初始化优化方案

## 📊 测试结果总结

### ✅ 成功部分
1. 成功访问登录页面（https://hga038.com）
2. 成功填写账号密码并登录
3. 成功检测到改密容器 `#chgAcc_show`

### ⚠️ 问题部分
1. 改密容器初始是隐藏的（`display: none`）
2. 需要先处理登录后的确认弹窗
3. 输入框选择器需要优化

---

## 🔍 关键发现

### 1. 页面结构分析

#### 创建账号页面 (chg_id)
```html
<div id="chgAcc_show" class="chg_acc" style="display: none;">
  <div class="input_chgpwd chgid_input">
    <label id="lab_login" class="lab_input">
      <input id="username" class="userid" type="text" autocomplete="off" required>
      <span class="text_input" data-tooltip="登入帐号"></span>
    </label>
    <i id="chgid_dele" class="btn_clear"></i>
  </div>

  <div id="check_name" class="btn_choose unable">检查</div>
  <span id="chgid_text_error" class="text_msg" style="display: none;"></span>
  <div id="login_btn" class="btn_submit">提交</div>
</div>
```

**关键元素**:
- 容器: `#chgAcc_show`
- 输入框: `#username` (class="userid")
- 检查按钮: `#check_name`
- 提交按钮: `#login_btn` (不是 `#login_btn` input类型)
- 错误提示: `#chgid_text_error`

#### 登录后弹窗
```javascript
// 代码中提到的弹窗逻辑
if (top["userData"].four_pwd == "new" && !firstchgid) {
  if (top["userData"].abox4pwd_notshow != "Y") {
    _self.showAlertMsg({
      "target": "C_alert_confirm",
      "msg": LS.get("4pwd_new"),
      "confirm": "Y",
      "retFun": _self.newalertMsg
    });
  }
}
```

**确认按钮**: `#C_yes_btn`, `#C_ok_btn`, `#ok_btn`

---

## 🛠 代码优化建议

### 1. 增强弹窗处理逻辑

**位置**: `acknowledgeCredentialPrompts` 方法

**当前代码**:
```typescript
private async acknowledgeCredentialPrompts(page: Page, timeout = 15000) {
  const buttonCandidates = page.locator(
    '.popup_bottom .btn_submit:visible, .box_help_btn .btn_submit:visible, #C_ok_btn:visible, #ok_btn:visible, #kick_ok_btn:visible, #info_close:visible, #R_info_close:visible, #message_ok:visible',
  );
  // ...
}
```

**建议优化**:
```typescript
private async acknowledgeCredentialPrompts(page: Page, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let handled = false;

    // 优先处理改密相关的确认按钮
    const confirmButtons = page.locator(
      '#C_yes_btn:visible, #C_ok_btn:visible, #ok_btn:visible, #yes_btn:visible, ' +
      '.popup_bottom .btn_submit:visible, .box_help_btn .btn_submit:visible, ' +
      '#kick_ok_btn:visible, #info_close:visible, #R_info_close:visible, #message_ok:visible'
    );

    const count = await confirmButtons.count().catch(() => 0);
    if (count > 0) {
      try {
        await confirmButtons.first().click({ force: true, timeout: 4000 });
        console.log(`✅ 已点击确认按钮`);
        handled = true;
      } catch (err) {
        console.warn('⚠️ 点击确认按钮失败:', err);
      }
      await this.randomDelay(500, 800);
    }

    // 检查改密容器是否已显示
    const chgAccVisible = await page.locator('#chgAcc_show:visible').count().catch(() => 0);
    if (chgAccVisible > 0) {
      console.log('✅ 改密容器已显示');
      break;
    }

    if (!handled) {
      const popupCount = await page
        .locator('#C_alert_ok:visible, #alert_ok:visible, #C_msg_ok:visible, #msg_ok:visible, #alert_kick:visible, #C_alert_confirm:visible')
        .count()
        .catch(() => 0);
      if (popupCount === 0) {
        break;
      }
    }

    await this.randomDelay(250, 400);
  }
}
```

### 2. 优化选择器配置

**位置**: `applyCredentialChange` 方法中的账号输入框选择器

**当前fallback**:
```typescript
const fallbackSelectors = ['#username', '#chgAcc_show .userid', 'input.userid'];
```

**建议优化** (这个其实已经很好了):
```typescript
const fallbackSelectors = [
  '#username',                    // 直接ID选择器
  '#chgAcc_show input.userid',    // 容器内的输入框
  '.chgid_input input.userid',    // 通过父容器查找
  'input.userid:visible',         // 可见的userid输入框
];
```

### 3. 增强检查按钮点击逻辑

**位置**: `applyCredentialChange` 方法 loginId 分支

**当前代码**:
```typescript
const checkSelectors: string[] = [];
if (selectors.checkButton) {
  checkSelectors.push(selectors.checkButton);
}
checkSelectors.push('#check_name', '.btn_choose');
```

**建议优化**:
```typescript
const checkSelectors: string[] = [];
if (selectors.checkButton) {
  checkSelectors.push(selectors.checkButton);
}
// 添加皇冠特定的检查按钮选择器
checkSelectors.push(
  '#check_name:visible',           // 皇冠的检查按钮
  '.btn_choose:visible',           // 通用检查按钮
  'button:has-text("检查"):visible',
  'div:has-text("检查"):visible'
);

// 移除 unable 类（禁用状态）
await target.evaluate(() => {
  const checkBtn = document.querySelector('#check_name');
  if (checkBtn && checkBtn.classList.contains('unable')) {
    checkBtn.classList.remove('unable');
  }
}).catch(() => undefined);
```

### 4. 提交按钮选择器优化

**位置**: `applyCredentialChange` 方法提交部分

**建议优化**:
```typescript
// 对于 loginId 类型，使用皇冠特定的提交按钮
if (selectors.formType === 'loginId') {
  let submitSelector = selectors.submitButton;

  // 如果没有自动检测到，尝试皇冠特定选择器
  if (!submitSelector) {
    const crownSubmitSelectors = [
      '#login_btn:visible',            // 皇冠创建账号提交按钮
      '.btn_submit:visible',           // 通用提交按钮
      'div:has-text("提交"):visible',
      'div:has-text("確認"):visible',
      'div:has-text("确认"):visible',
    ];

    for (const selector of crownSubmitSelectors) {
      const count = await target.locator(selector).count().catch(() => 0);
      if (count > 0) {
        submitSelector = selector;
        break;
      }
    }
  }

  if (submitSelector) {
    await target.locator(submitSelector).first().click({ timeout: 5000, force: true });
  }
}
```

### 5. 改密容器等待逻辑

**新增方法建议**:
```typescript
private async waitForChangeFormVisible(page: Page, timeout = 20000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // 检查改密容器是否显示
    const chgAccVisible = await page.locator('#chgAcc_show:visible').count().catch(() => 0);
    const chgPwdVisible = await page.locator('#chgPwd_show:visible').count().catch(() => 0);

    if (chgAccVisible > 0 || chgPwdVisible > 0) {
      console.log('✅ 改密容器已显示');
      await this.randomDelay(500, 1000);
      return true;
    }

    // 尝试点击可能的确认按钮
    await this.acknowledgeCredentialPrompts(page, 2000).catch(() => undefined);

    await this.randomDelay(300, 500);
  }

  return false;
}
```

---

## 🎯 修改优先级

### P0 - 必须修改
1. ✅ **acknowledgeCredentialPrompts**: 增加 `#C_yes_btn`, `#C_ok_btn` 等按钮
2. ✅ **检查容器显示**: 在点击确认按钮后，等待 `#chgAcc_show` 显示

### P1 - 建议修改
3. ⚡ **移除 unable 类**: 在点击检查按钮前移除禁用状态
4. ⚡ **提交按钮选择器**: 使用 `#login_btn` (DIV元素，不是input)

### P2 - 可选优化
5. 🔧 **错误提示检测**: 监听 `#chgid_text_error` 的内容
6. 🔧 **成功提示检测**: 检测 "你的帐号已成功创建" 等文本

---

## 🧪 测试计划

### 测试用例

#### TC1: 首次登录改账号
1. 登录原始账号密码
2. 弹窗出现 → 点击"是"按钮
3. `#chgAcc_show` 显示
4. 填写新账号
5. 点击"检查"按钮
6. 验证成功提示
7. 点击"提交"按钮
8. 验证成功消息

#### TC2: 检查账号已被使用
1. 输入已存在的账号
2. 点击"检查"
3. 应显示错误："此登录帐号已有人使用。"

#### TC3: 检查账号格式错误
1. 输入不符合规则的账号（如少于6个字符）
2. 点击"检查"
3. 应显示格式错误提示

---

## 📝 实现步骤

1. **备份当前代码**
   ```bash
   cp backend/src/services/crown-automation.ts backend/src/services/crown-automation.ts.backup
   ```

2. **修改 acknowledgeCredentialPrompts**
   - 添加新的按钮选择器
   - 增加容器显示检测

3. **修改 applyCredentialChange**
   - 移除 unable 类
   - 优化提交按钮选择器

4. **测试验证**
   ```bash
   node test-initialize.js
   ```

5. **查看日志和截图**
   - 检查 `test-screenshots/` 目录
   - 验证每个步骤的页面状态

---

## 🔗 参考信息

### 错误消息映射
```javascript
"chgid_complete": "你的帐号已成功创建",
"chgid_error": "请输入登录帐号。",
"chgid_error_duplicate": "此登录帐号已有人使用。",
"chgid_error_rule": "您输入的登录帐号不符合要求：\n1.您的登录帐号必须由2个英文大小写字母(A-Z或a-z)和数字(0-9)组合,输入限制6-12字元。\n2.您的登录帐号不准许有空格。",
"chgid_error_passwd": "登录帐号请勿和帐号密码相同。"
```

### 账号规则
- 长度: 6-12个字符
- 组成: 至少2个字母(A-Z/a-z) + 至少1个数字(0-9)
- 限制: 不能有空格、不能与密码相同

---

## ✅ 总结

主要问题是登录后的弹窗确认和容器显示的时序问题。通过以下优化即可解决：

1. 增强弹窗按钮识别 (`#C_yes_btn`, `#C_ok_btn`)
2. 等待改密容器显示后再操作
3. 移除检查按钮的禁用状态
4. 使用正确的提交按钮选择器 (`#login_btn` DIV元素)

这些修改后，自动改密功能应该可以顺利工作。
