# Git 推送问题解决方案

## 问题现象
```
fatal: unable to access 'https://github.com/WiseInvest513/core.git/': 
Failed to connect to github.com port 443 after 75001 ms: Couldn't connect to server
```

## 解决方案

### 方案1：配置 Git 代理（如果你有代理工具）

如果你使用了代理工具（如 Clash、V2Ray、Shadowsocks 等），需要配置 Git 使用代理：

#### 查看代理端口
- Clash 默认端口：`7890`
- V2Ray 默认端口：`1080` 或 `10808`
- Shadowsocks 默认端口：`1080`

#### 配置 Git 使用 HTTP 代理
```bash
# 设置 HTTP 代理（替换为你的实际代理端口）
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 如果代理需要认证
# git config --global http.proxy http://username:password@127.0.0.1:7890
```

#### 配置 Git 使用 SOCKS5 代理
```bash
# SOCKS5 代理（V2Ray/Shadowsocks 通常使用）
git config --global http.proxy socks5://127.0.0.1:1080
git config --global https.proxy socks5://127.0.0.1:1080
```

#### 验证配置
```bash
git config --global --get http.proxy
git config --global --get https.proxy
```

#### 推送代码
```bash
git push origin main
```

#### 取消代理（如果不需要了）
```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

---

### 方案2：使用 SSH 方式（推荐，更稳定）

#### 步骤1：检查是否已有 SSH Key
```bash
ls -la ~/.ssh
```

如果有 `id_rsa.pub` 或 `id_ed25519.pub` 文件，说明已经有 SSH key。

#### 步骤2：如果没有 SSH Key，生成一个
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
# 按 Enter 使用默认路径，可以设置密码或留空
```

#### 步骤3：复制公钥内容
```bash
cat ~/.ssh/id_ed25519.pub
# 或者
cat ~/.ssh/id_rsa.pub
```

#### 步骤4：添加到 GitHub
1. 访问 https://github.com/settings/keys
2. 点击 "New SSH key"
3. Title: 填写一个名称（如 "My MacBook"）
4. Key: 粘贴刚才复制的公钥内容
5. 点击 "Add SSH key"

#### 步骤5：修改远程仓库地址为 SSH
```bash
cd "/Users/balala/个人资料/Blog/Core"
git remote set-url origin git@github.com:WiseInvest513/core.git
git remote -v  # 验证修改
```

#### 步骤6：测试 SSH 连接
```bash
ssh -T git@github.com
# 应该看到：Hi WiseInvest513! You've successfully authenticated...
```

#### 步骤7：推送代码
```bash
git push origin main
```

---

### 方案3：使用 GitHub Desktop（最简单）

1. 下载安装 [GitHub Desktop](https://desktop.github.com/)
2. 使用 GitHub 账号登录
3. 添加本地仓库（File → Add Local Repository）
4. 选择项目目录
5. 点击 "Push origin" 按钮

GitHub Desktop 通常会自动处理网络问题。

---

### 方案4：稍后重试

如果网络不稳定，可以稍后再试：
```bash
# 等待一段时间后重试
git push origin main
```

---

### 方案5：使用镜像站（不推荐，仅作备选）

可以使用 GitHub 的镜像站，但这会影响正常的 Git 工作流，不推荐长期使用。

---

## 推荐方案

**最推荐使用 SSH 方式（方案2）**，因为：
- 更稳定，不受 HTTPS 端口限制
- 不需要每次输入密码
- 安全性更高

如果你已经有代理工具，**方案1（配置代理）** 也是快速有效的选择。

