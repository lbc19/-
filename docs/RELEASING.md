# 发布 v0.1.0

只发布本项目文件夹的内容，不发布它外面的 work、outputs 或个人工作目录。尚未上传 GitHub；下列步骤由发布者在准备公开时执行。

1. 在独立目录解压源码，运行 `npm test`、`npm run check:privacy`。
2. 运行 `npm start`，打开 http://127.0.0.1:3210 检查演示状态。若已有程序占用端口，应先关闭旧后台。检查不会自动清理原有浏览器记录。
3. 检查 README、LICENSE 和 CHANGELOG。当前采用 MIT；代码发布者应确认有权许可贡献内容。
4. 在 GitHub 创建空仓库，例如 versatile-virtual-character。仓库描述可写“本地中文 AI 虚拟角色聊天与分层资料库”。
5. 只将当前项目目录内的清单文件上传。使用 Git 时，在这个项目目录单独初始化仓库，提交前查看 `git diff --cached`，不要初始化整个桌面或上级目录。
6. GitHub Actions 检查通过后，创建 `v0.1.0` 标签与 Release，发布说明使用 CHANGELOG 内容；可附经过检查的源码 ZIP。这不是 Windows 安装包。

首次发布不需要服务器、域名或项目维护者的 API 密钥。不要将任何真实密钥添加到 GitHub Actions secrets；当前测试不需要它们。

## 本次验证范围

Node.js 24 / Windows 下运行模拟回归、发布清单与常见隐私模式扫描，并从干净副本验证本地静态页面、初始无密钥状态和受保护接口。未进行付费模型效果测试。扫描不能保证没有未知漏洞。
