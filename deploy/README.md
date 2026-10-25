# 部署

- 服务器：`59.110.51.187:22`；站点：`https://www.eventclub.cn`。
- 分支：前端 `refactor/tailwind-v3`，后端 `dev`；应用统一以 `eventadmin` 运行。

## 本地配置

在完整仓库中执行，替换登录账户和密钥路径：

```bash
export SERVER_USER="eventadmin"  # 或已授权账户
export SSH_KEY="$HOME/.ssh/eventclubNew.pem"
ssh-add "$SSH_KEY"
```

首次连接需核对服务器指纹；工具未继承 SSH 代理时，传入本机终端的 `SSH_AUTH_SOCK` 值作为 `SSH_AGENT_SOCKET`。

## 前端发布与回滚

在前端仓库根目录执行。先同步分支并提交代码；生产变量使用 `env/.env.production`，禁止包含后端密钥。

```bash
git push origin refactor/tailwind-v3
export DEPLOY_REV="$(git rev-parse HEAD)"
bash deploy/deploy-frontend.sh --check  # 检查远端权限
bash deploy/deploy-frontend.sh --plan   # 离线查看目标
bash deploy/deploy-frontend.sh --apply  # 构建、上传并切换版本

DEPLOY_REV="<已部署完整commit>" bash deploy/deploy-frontend.sh --rollback
```

只发布已提交代码，push 不自动上线。同一环境串行发布，同一 commit 不重复发布；回滚版本须与后端兼容。保留旧 hash 资源。

## 账户授权（服务器）

上传 `deploy/grant-deployer.sh` 后，由管理员执行，账户须已存在：

```bash
sudo -l -U eventadmin
sudo bash /path/to/grant-deployer.sh "<登录账户>"
```

授权范围为 `eventadmin` 的全部账户权限，包含生产配置访问。规则位于 `/etc/sudoers.d/eventclub-deploy-<账户>`；撤销后执行 `sudo visudo -c`。

## 后端发布

在后端仓库使用 `local-deploy/deploy-server.sh`：`--check` 检查权限，`--stage` 上传与校验，`--activate` 激活，`--rollback` 回滚。配置与命令见该仓库 `local-deploy/SERVER.md`。

前后端同时更新且接口兼容时，先后端再前端。重启后端前暂停匹配提交并等待队列清空；部署不执行数据库迁移。

## 发布检查

```bash
curl -fsS https://www.eventclub.cn/api/health
# 服务器上执行
systemctl status nginx pm2-eventadmin eventclub-cert-renew.timer
```

验证登录、活动、深层路由刷新、图片和匹配；健康检查不能替代业务验证。

## 首次安装

仅新服务器执行。前端仓库中上传初始化脚本：

```bash
bash deploy/prepare-server.sh --plan
bash deploy/prepare-server.sh --apply
```

服务器上执行；HTTPS 启用前完成前后端部署，并确认备案、DNS 和 80/443 端口已就绪：

```bash
sudo bash /home/eventadmin/eventclub/bootstrap/bootstrap.sh --apply
sudo bash /home/eventadmin/eventclub/bootstrap/enable-https.sh
```
