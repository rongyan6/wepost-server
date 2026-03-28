# @rongyan/wxpost-server

微信公众号内容发布服务，支持多账号，提供图片上传、草稿管理和发布等 HTTP 接口。

## 要求

- Node.js >= 18
- 微信公众号开发者账号（AppID + AppSecret）
- 服务器 IP 已加入微信公众平台 **IP 白名单**

## 安装

```bash
npm install -g @rongyan/wxpost-server@latest
```

## 初始化配置

首次运行以下命令，程序会自动在 `~/.@rongyan/env.json` 创建配置模板：

```
wxpost-server --help

  配置文件已创建：/root/.@rongyan/env.json
  请编辑该文件，填入你的公众号 AppID 和 AppSecret，然后重新启动。

  格式说明：
    port            — 监听端口（也可用 --port 参数或 PORT 环境变量覆盖）
    api_key         — HTTP 接口鉴权密钥
    upload_dir      — 本地图片存储目录（默认 ~/.@rongyan/upload_dir/）
    log_dir         — 日志目录（默认 ~/.@rongyan/log/）
    defaultAccount  — 默认使用的 AppID
    accounts        — 以 AppID 为 key，每个账号填写对应的 appSecret
```

编辑 `~/.@rongyan/env.json`，填入真实值：

```json
{
  "port": 3000,
  "api_key": "your-api-key",
  "upload_dir": "/Users/yourname/.@rongyan/upload_dir",
  "defaultAccount": "wx_appid",
  "accounts": {
    "wx_appid": {
      "appSecret": "your-app-secret"
    },
    "wx_another_appid": {
      "appSecret": "another-app-secret"
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `port` | 配置文件中的默认监听端口，默认 `3000`；可被 `--port` 参数或 `PORT` 环境变量覆盖 |
| `api_key` | HTTP 接口鉴权密钥 |
| `upload_dir` | 图片上传临时目录，默认 `~/.@rongyan/upload_dir/` |
| `defaultAccount` | 不传 `appid` 参数时使用的默认账号（填 AppID） |
| `accounts` | 多账号配置，以 AppID 为 key，每个账号填写 `appSecret` |

## 启动

```bash
# 直接启动
wxpost-server

# 指定端口
wxpost-server --port 8080

# 通过环境变量指定端口
PORT=8080 wxpost-server
```

端口优先级：`--port 参数` > `PORT 环境变量` > `配置文件 port` > `默认 3000`

### 使用 PM2（推荐生产环境）

```bash
pm2 start wxpost-server --name wxpost-server -- --port 3000

pm2 save                     # 保存进程列表，重启后自动恢复
pm2 startup                  # 设置开机自启（按提示执行输出的命令）
pm2 logs wxpost-server       # 查看日志
pm2 restart wxpost-server
pm2 stop wxpost-server
```

## IP 白名单

微信接口要求服务器 IP 在白名单内。配置路径：

**微信公众平台** → 设置与开发 → 基本配置 → IP 白名单

## token 缓存

access_token 自动缓存至 `~/.@rongyan/tokens.json`，有效期 7200 秒，提前 5 分钟自动刷新，多进程共享同一缓存文件。

---

## API

所有接口均需鉴权，支持以下两种方式（二选一）：

```
Authorization: Bearer <api_key>
X-Api-Key: <api_key>
```

所有请求和响应均为 JSON（上传图片除外）。响应体统一包含 `ok` 字段，`true` 表示成功，`false` 表示失败（同时包含 `error` 字段）。

多账号场景可通过 `?appid=` 查询参数指定账号，不传则使用 `defaultAccount`。

---

### POST /upload-image

上传图片到微信服务器，返回微信 CDN 图片地址。

**请求格式：** `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `media` | file | 图片文件，仅支持 JPG/PNG（按文件内容识别），大小须严格小于 1MB |

**查询参数：**

| 参数 | 说明 |
|------|------|
| `appid` | 可选，指定使用的公众号 AppID，不传使用默认账号 |

**请求示例：**

```bash
curl -X POST http://localhost:3000/upload-image \
  -H "Authorization: Bearer your-api-key" \
  -F "media=@/path/to/image.jpg"
```

**成功响应：**

```json
{
  "ok": true,
  "url": "https://mmbiz.qpic.cn/..."
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 401 | 鉴权失败 |
| 400 | 格式不支持（非 JPG/PNG） |
| 413 | 图片超过 1MB，请压缩后重试 |
| 502 | 微信接口调用失败 |

---

### POST /upload-material

上传图片为**永久素材**，返回 `media_id` 和微信 CDN 地址。永久素材可用于草稿封面图（`thumb_media_id`）等需要持久化的场景。

**请求格式：** `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `media` | file | 图片文件，支持 JPG/PNG/GIF/BMP（按文件内容识别），大小须严格小于 10MB |

**查询参数：**

| 参数 | 说明 |
|------|------|
| `appid` | 可选，指定使用的公众号 AppID，不传使用默认账号 |

**请求示例：**

```bash
curl -X POST http://localhost:3000/upload-material \
  -H "Authorization: Bearer your-api-key" \
  -F "media=@/path/to/cover.jpg"
```

**成功响应：**

```json
{
  "ok": true,
  "media_id": "xxx",
  "url": "https://mmbiz.qpic.cn/..."
}
```

> `url` 仅在微信/腾讯域名下有效，不可在外部网页直接引用。

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 401 | 鉴权失败 |
| 400 | 格式不支持（非 JPG/PNG/GIF/BMP） |
| 413 | 图片超过 10MB，请压缩后重试 |
| 502 | 微信接口调用失败 |

---

### POST /draft/add

新增草稿，返回草稿的 `media_id`。

**请求格式：** `application/json`

**请求体：**

```json
{
  "articles": [
    {
      "article_type": "news",
      "title": "文章标题",
      "author": "作者",
      "digest": "摘要",
      "content": "<p>正文 HTML</p>",
      "content_source_url": "https://example.com",
      "thumb_media_id": "封面图素材ID",
      "need_open_comment": 0,
      "only_fans_can_comment": 0,
      "pic_crop_235_1": "0,0,1,0.4985",
      "pic_crop_1_1": "0,0,1,1",
      "cover_info": {},
      "product_info": {}
    }
  ]
}
```

**articles 字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `article_type` | string | 否 | `"news"`（图文，默认）或 `"newspic"`（图片） |
| `title` | string | 是 | 超过 64 字自动截断 |
| `author` | string | 否 | 最多 16 字 |
| `digest` | string | 否 | 摘要，最多 128 字；不填则从正文自动截取 |
| `content` | string | 是 | 正文 HTML |
| `content_source_url` | string | 否 | 点击"阅读原文"跳转的 URL |
| `thumb_media_id` | string | news 类型必填 | 封面图的永久素材 MediaID |
| `image_info` | object | newspic 类型必填 | 图片列表，`{ "list": [...] }`，最多 20 张 |
| `need_open_comment` | number | 否 | 是否开启评论：`0` 关闭，`1` 开启 |
| `only_fans_can_comment` | number | 否 | 仅粉丝可评论：`0` 所有人，`1` 仅粉丝 |
| `pic_crop_235_1` | string | 否 | 封面裁剪坐标（2.35:1） |
| `pic_crop_1_1` | string | 否 | 封面裁剪坐标（1:1） |
| `cover_info` | object | 否 | 封面裁剪信息对象 |
| `product_info` | object | 否 | 商品信息对象 |

**成功响应：**

```json
{
  "ok": true,
  "media_id": "草稿的media_id"
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 401 | 鉴权失败 |
| 400 | 参数校验失败或微信接口返回错误 |
| 413 | 请求体超过 2MB |
| 502 | 获取 access_token 失败 |

---

### POST /draft/list

获取草稿列表（分页）。

**请求格式：** `application/json`（请求体可省略，使用默认值）

**请求体：**

```json
{
  "offset": 0,
  "count": 20,
  "no_content": 0
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `offset` | number | `0` | 起始偏移，从 0 开始 |
| `count` | number | `20` | 返回数量，1–20 |
| `no_content` | number | `0` | `1` 表示不返回正文内容，`0` 返回 |

**成功响应：**

```json
{
  "ok": true,
  "total_count": 100,
  "item_count": 20,
  "item": [
    {
      "media_id": "草稿ID",
      "update_time": 1234567890,
      "content": {
        "news_item": [
          {
            "title": "文章标题",
            "author": "作者",
            "digest": "摘要",
            "content": "<p>正文</p>",
            "thumb_media_id": "封面素材ID",
            "url": "草稿预览链接",
            "article_type": "news"
          }
        ]
      }
    }
  ]
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 401 | 鉴权失败 |
| 400 | 参数错误或微信接口返回错误 |
| 502 | 获取 access_token 失败 |

---

### POST /draft/publish

发布草稿为正式图文，返回发布任务 ID。

**请求格式：** `application/json`

**请求体：**

```json
{
  "media_id": "草稿的media_id"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `media_id` | string | 是 | 要发布的草稿 ID |

**成功响应：**

```json
{
  "ok": true,
  "publish_id": "发布任务ID",
  "msg_data_id": "消息数据ID"
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 401 | 鉴权失败 |
| 400 | 缺少 `media_id`、草稿未通过检查或其他微信错误（含错误码） |
| 502 | 获取 access_token 失败 |

**微信错误码：**

| 错误码 | 说明 |
|--------|------|
| 48001 | 接口未授权，确认公众号已开通该能力 |
| 53503 | 草稿未通过发布检查，检查草稿内容 |
| 53504 | 需前往公众平台官网操作 |
| 53505 | 请手动保存成功后再发布 |

---

## 典型工作流

```bash
# 1. 上传文章封面图，获取永久素材 media_id
curl -X POST http://localhost:3000/upload-material \
  -H "Authorization: Bearer your-api-key" \
  -F "media=@cover.jpg"

# 2. 新增草稿
curl -X POST http://localhost:3000/draft/add \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "articles": [{
      "title": "文章标题",
      "content": "<p>正文内容</p>",
      "thumb_media_id": "上一步返回的media_id"
    }]
  }'

# 3. 发布草稿
curl -X POST http://localhost:3000/draft/publish \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{ "media_id": "上一步返回的media_id" }'
```
