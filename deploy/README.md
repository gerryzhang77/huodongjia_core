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

## DNS 与 HTTPS

前后端就绪、备案有效、安全组允许 TCP 80/443 后，将 www 和裸域 DNS 改为服务器 A 记录；检查冲突 CNAME/AAAA。当前证书配置覆盖这两个域名，裸域跳转 www。
DNS 生效后，在自己的 SSH 终端执行：

```bash
sudo /opt/eventclub/certbot/bin/certbot certonly --webroot -w /var/www/eventclub/acme \
  --cert-name www.eventclub.cn -d www.eventclub.cn -d eventclub.cn \
  --agree-tos --register-unsafely-without-email --non-interactive
sudo bash /home/eventadmin/eventclub/bootstrap/bootstrap.sh --https
```

此示例不提供联系邮箱；可替换为 `--email <运维邮箱>`。证书签发前处于短时维护模式。初始化已配置每天两次检查续期，并在续期后校验、重载 Nginx。

## 运维与验收

- 检查 `systemctl status nginx pm2-eventadmin eventclub-cert-renew.timer`。
- 后端只监听 127.0.0.1:10203，公网经 Nginx /api 访问。
- `/api/health` 不代替业务验收；发布后验证首页、登录、活动、深层页面刷新、图片与匹配。
- Nginx 访问日志只记录方法、状态、耗时等，不记录 URI；NFC token 不进入日志。
- 首次上线没有旧机回滚目标，首个验收通过版本作为基线。
- 重启后端前暂停新的匹配提交并等待任务完成，只运行一个 PM2 实例，不能让旧机同时消费任务。
- 后台任务/自动短信在首次验收期间关闭，后续按业务需要启用。
- Vercel 的分支预览、CDN、平台回滚不会随迁移自动保留。
