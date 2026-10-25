# 服务器部署

生产目标：`eventadmin@59.110.51.187:22`，前端域名 `https://www.eventclub.cn`。前端使用 `refactor/tailwind-v3`，后端使用 `dev`。不再通过推送 `guangming/main` 发布生产。

## 首次安装

```bash
bash deploy/prepare-server.sh --plan
bash deploy/prepare-server.sh --apply
ssh -t -i ~/.ssh/eventclubNew.pem -o IdentitiesOnly=yes eventadmin@59.110.51.187 \
  'sudo bash /home/eventadmin/eventclub/bootstrap/bootstrap.sh --apply'
```

密码只在自己的终端输入。脚本先启用 HTTP 维护入口，不修改 DNS 或写数据库。自动工具没有继承 ssh-agent 时，可设置 `SSH_AGENT_SOCKET` 为当前会话实际代理套接字；不要提交临时套接字路径。

## 日常发布与回滚

先提交并推送到 `origin/refactor/tailwind-v3`，固定完整 commit：

```bash
DEPLOY_REV=<完整commit> bash deploy/deploy-frontend.sh --plan
DEPLOY_REV=<完整commit> bash deploy/deploy-frontend.sh --apply
# 回滚到已经上传、与后端兼容的版本
DEPLOY_REV=<已上传commit> bash deploy/deploy-frontend.sh --rollback
```

脚本从 Git 提取干净版本，在临时目录安装锁定依赖、检查类型并构建，只上传 dist。生产环境变量在构建时写入前端，必须先修改再重新构建；禁止加入后端密钥。
hash 资源保留在共享 assets 目录，避免旧页面加载失败；清理时需考虑仍打开的客户端和回滚窗口。

后端仓库使用 `local-deploy/deploy-server.sh`，详见后端 `local-deploy/SERVER.md`。配置、模型、上传文件和任务记录均在静态站点目录之外。普通应用部署不执行数据库 migrations。

## 使用个人账户发布

SSH 登录账户通过 `SERVER_USER` 指定，默认仍为 `eventadmin`。其他已授权账户使用自己的密钥连接，脚本通过 `sudo -n -H -u eventadmin` 执行远端操作，并固定 HOME、PM2_HOME、Node PATH 和工作目录。应用继续由同一个 eventadmin/PM2 实例管理；不需要共享私钥或放开应用目录权限。

管理员先核对 `sudo -l -U eventadmin`，再将本仓库 `deploy/grant-deployer.sh` 放到服务器，在自己的 SSH 终端执行：

```bash
sudo bash /path/to/grant-deployer.sh <个人登录账户>
```

脚本要求账户已存在，新增 `/etc/sudoers.d/eventclub-deploy-<账户>`，校验完整 sudo 配置并验证账户切换；不会重启服务，也不会覆盖不同内容的已有规则。规则授予该账户以 eventadmin 执行任意命令的能力，包含读取生产配置和修改应用；若 eventadmin 有额外提权能力，也需一并评估。它不是只允许固定发布操作的命令白名单。

同事在本地完整仓库中执行（替换密钥路径和完整 commit）：

```bash
export SERVER_USER=<个人登录账户>
export SSH_KEY="$HOME/.ssh/<自己的私钥>"
bash deploy/deploy-frontend.sh --check
DEPLOY_REV=<完整commit> bash deploy/deploy-frontend.sh --plan
DEPLOY_REV=<完整commit> bash deploy/deploy-frontend.sh --apply
```

`--check` 连接服务器，只验证 eventadmin 身份、目录权限和传输工具；不构建、不上传、不切换版本。`--plan` 完全离线，不验证服务器权限。实际发布和回滚也会先执行权限检查。

私钥有口令时先在自己的终端运行 `ssh-add "$SSH_KEY"`。首次连接需核对服务器指纹；自动工具没有继承代理时可传入当前 `SSH_AGENT_SOCKET`，不要把会话路径写入仓库。多人发布需协调，不能同时操作同一环境。撤销时由管理员移除该账户的专用 sudoers 规则并运行 `sudo visudo -c`。

## DNS 与 HTTPS

前后端就绪、备案有效、安全组允许 TCP 80/443 后，将 www 和裸域 DNS 改为服务器 A 记录；检查冲突 CNAME/AAAA。当前证书配置覆盖这两个域名，裸域跳转 www。
DNS 生效后，在自己的 SSH 终端执行：

```bash
sudo bash /home/eventadmin/eventclub/bootstrap/enable-https.sh
```

脚本不提供联系邮箱；需要时可将其中 `--register-unsafely-without-email` 替换为 `--email <运维邮箱>`。证书签发前处于短时维护模式。网络超时最多尝试 3 次，签发后启用 HTTPS 并执行一次 staging 续期演练。初始化已配置每天两次检查续期，并在续期后校验、重载 Nginx；续期失败后每隔 5 分钟重试，1 小时内最多 3 次。域名验证或配置错误不会在签发脚本中盲目重试。

## 运维与验收

- 检查 `systemctl status nginx pm2-eventadmin eventclub-cert-renew.timer`。
- 后端只监听 127.0.0.1:10203，公网经 Nginx /api 访问。
- `/api/health` 不代替业务验收；发布后验证首页、登录、活动、深层页面刷新、图片与匹配。
- Nginx 访问日志只记录方法、状态、耗时等，不记录 URI；NFC token 不进入日志。
- 首次上线没有旧机回滚目标，首个验收通过版本作为基线。
- 重启后端前暂停新的匹配提交并等待任务完成，只运行一个 PM2 实例，不能让旧机同时消费任务。
- 后台任务/自动短信在首次验收期间关闭，后续按业务需要启用。
- Vercel 的分支预览、CDN、平台回滚不会随迁移自动保留。
