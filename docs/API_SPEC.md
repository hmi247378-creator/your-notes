# 你的笔记（Your Notes）API 规格（Phase 1）

> 目标：让 PC Web 与小程序可以并行开发、按统一协议联调。本文为 Phase 1 MVP 所需接口最小集合；Phase 2（富文本、导出、统计面板、向量分类）在此基础上扩展。

## 一、通用约定

### 1.1 Base
- Base URL：`/api`
- 鉴权：`Authorization: Bearer <token>`
- 时间：ISO 8601（如 `2026-02-10T12:00:00Z`）

### 1.2 通用响应
成功：
```json
{ "data": { } }
```
失败：
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": { }
  }
}
```

### 1.3 分页（列表接口）
请求参数：
- `page`: number（从 1 开始）
- `pageSize`: number（默认 20，最大 100）

响应：
```json
{
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 20,
    "total": 123
  }
}
```

### 1.4 幂等（Sync Push）
客户端每条变更都必须携带 `clientMutationId`（UUID），服务端需保证重复提交不重复生效。

## 二、Auth

### 2.1 注册（可选，若 Phase1 用微信登录可先占位）
`POST /auth/register`

Request：
```json
{ "email": "a@b.com", "password": "******", "nickname": "haimi" }
```
Response：
```json
{ "data": { "token": "jwt", "user": { "id": "uuid", "nickname": "haimi" } } }
```

### 2.2 登录
`POST /auth/login`

Request：
```json
{ "email": "a@b.com", "password": "******" }
```
Response 同上。

### 2.3 获取当前用户
`GET /auth/me`

Response：
```json
{ "data": { "id": "uuid", "nickname": "haimi" } }
```

## 三、Tags（标签树）

### 3.1 获取标签树
`GET /tags/tree`

Response：
```json
{
  "data": {
    "tags": [
      {
        "id": "uuid",
        "name": "工作",
        "color": "#3B82F6",
        "parentId": null,
        "path": "work",
        "depth": 1,
        "children": []
      }
    ]
  }
}
```

### 3.2 创建标签
`POST /tags`

Request：
```json
{
  "name": "项目A",
  "color": "#22C55E",
  "parentId": "uuid-or-null"
}
```

Response：
```json
{ "data": { "id": "uuid", "path": "work.projectA", "depth": 2 } }
```

校验：
- `name` 非空
- 新标签 `depth <= 7`

### 3.3 更新标签（重命名/改色/移动）
`PATCH /tags/:id`

Request（按需传字段）：
```json
{
  "name": "项目A-新版",
  "color": "#F97316",
  "parentId": "uuid-or-null"
}
```

Response：
```json
{ "data": { "id": "uuid", "path": "work.projectA2", "depth": 2 } }
```

校验：
- 移动后整棵子树的最大深度仍需 `<= 7`
- 禁止将标签移动到自己的子树中（形成环）

### 3.4 合并标签（批量操作）
`POST /tags/merge`

Request：
```json
{
  "sourceTagIds": ["uuid1", "uuid2"],
  "targetTagId": "uuid3",
  "deleteSources": true
}
```
Response：
```json
{ "data": { "migratedNoteCount": 120 } }
```

说明：
- 需要将 `note_tags` 中 source 关联迁移到 target（去重）
- 可选删除 source 标签（若删除，需连带删除其子树或阻止合并带子树标签；Phase1 建议：source 必须是叶子节点）

### 3.5 删除标签
`DELETE /tags/:id`

Query：
- `strategy=block|moveNotesTo|cascade`
  - Phase1 推荐 `block`（若有关联笔记或子标签则不允许删除）

Response：
```json
{ "data": { "deleted": true } }
```

## 四、Notes（笔记）

### 4.1 创建笔记（MVP：只要一段文本即可）
`POST /notes`

Request：
```json
{
  "contentMarkdown": "下午3点和项目A开评审会，整理会议纪要",
  "tagIds": ["uuid1"],
  "source": "pc"
}
```
Response：
```json
{ "data": { "id": "uuid", "createdAt": "2026-02-10T12:00:00Z" } }
```

说明：
- 服务端需同时保存 `contentPlain`（由 markdown 提纯），用于搜索与分类

### 4.2 获取笔记列表（筛选/分页/视图）
`GET /notes`

Query：
- `tagIds=uuid1,uuid2`（可选）
- `q=keyword`（可选，Phase1 可直接走 search，也可在 notes 里做简化）
- `from=2026-02-01T00:00:00Z`（可选）
- `to=2026-02-10T23:59:59Z`（可选）
- `archived=true|false`（可选）
- `page`、`pageSize`

Response：
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "contentPreview": "下午3点和项目A开评审会…",
        "tagIds": ["uuid1"],
        "createdAt": "2026-02-10T12:00:00Z",
        "updatedAt": "2026-02-10T12:00:00Z",
        "archived": false
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 123
  }
}
```

### 4.3 获取笔记详情
`GET /notes/:id`

Response：
```json
{
  "data": {
    "id": "uuid",
    "contentMarkdown": "...",
    "tagIds": ["uuid1", "uuid2"],
    "createdAt": "...",
    "updatedAt": "...",
    "archived": false
  }
}
```

### 4.4 更新笔记（内容/标签/归档）
`PATCH /notes/:id`

Request：
```json
{
  "contentMarkdown": "更新后的内容",
  "tagIds": ["uuid1", "uuid3"],
  "archived": false
}
```

Response：
```json
{ "data": { "updated": true } }
```

### 4.5 批量操作
`POST /notes/batch`

Request：
```json
{
  "noteIds": ["n1", "n2"],
  "op": "updateTags",
  "tagIds": ["t1", "t2"]
}
```
或：
```json
{
  "noteIds": ["n1", "n2"],
  "op": "archive",
  "archived": true
}
```
Response：
```json
{ "data": { "affected": 2 } }
```

## 五、Search（全文搜索，Phase 1）

### 5.1 全文搜索
`GET /search`

Query：
- `q=关键词`（必填）
- `tagIds=uuid1,uuid2`（可选）
- `from` / `to`（可选）
- `page` / `pageSize`

Response：同分页结构，`items` 返回 note 摘要。

## 六、Classify（智能分类，Phase 1）

### 6.1 文本分类建议（实时返回 top3）
`POST /classify`

Request：
```json
{ "text": "下午3点和项目A开评审会，整理会议纪要" }
```

Response：
```json
{
  "data": {
    "suggestions": [
      { "tagId": "uuid1", "score": 0.82, "level": "high" },
      { "tagId": "uuid2", "score": 0.61, "level": "mid" },
      { "tagId": "uuid3", "score": 0.55, "level": "mid" }
    ],
    "explain": [
      { "tagId": "uuid1", "reasons": ["命中关键词：评审", "命中关键词：会议纪要"] }
    ]
  }
}
```

约束：
- 响应时间目标：< 1 秒
- 若用户未创建标签或标签太少：返回空 suggestions 并提示引导创建标签模板

### 6.2 分类反馈（闭环）
`POST /feedback`

Request：
```json
{
  "noteId": "noteUuid",
  "beforeTagIds": ["uuid1", "uuid2", "uuid3"],
  "afterTagIds": ["uuid1"],
  "reason": "更像会议纪要"
}
```

Response：
```json
{ "data": { "saved": true } }
```

说明：
- `beforeTagIds` 可来自 `classify` 的 top3
- `afterTagIds` 为用户最终确认
- 服务端需写入 `classification_feedback`，用于 Phase 2 个性化

## 七、Sync（离线与多端同步，Phase 1）

### 7.1 推送本地变更（小程序离线队列）
`POST /sync/push`

Request：
```json
{
  "changes": [
    {
      "clientMutationId": "uuid",
      "entityType": "note",
      "op": "upsert",
      "entityId": "noteUuid",
      "payload": {
        "contentMarkdown": "xxx",
        "tagIds": ["t1"],
        "archived": false
      },
      "clientTime": "2026-02-10T12:00:00Z"
    }
  ]
}
```

Response：
```json
{ "data": { "accepted": 1, "lastChangeLogId": 1001 } }
```

### 7.2 拉取增量变更
`GET /sync/pull?since=1001`

Response：
```json
{
  "data": {
    "changes": [
      {
        "changeLogId": 1002,
        "entityType": "tag",
        "op": "upsert",
        "entityId": "tagUuid",
        "payload": { }
      }
    ],
    "lastChangeLogId": 1010
  }
}
```

说明：
- 客户端保存 `lastChangeLogId`
- 每次启动/恢复网络时 pull 一次

## 八、Analytics（Phase 1 最小埋点）

### 8.1 上报事件（可选，Phase1 也可后端直接记录）
`POST /events`

Request：
```json
{
  "events": [
    { "name": "classify_shown", "ts": "2026-02-10T12:00:00Z", "props": { "count": 3 } }
  ]
}
```

Response：
```json
{ "data": { "saved": 1 } }
```

