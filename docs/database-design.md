# 数据库设计文档

## 1. 概述

本系统使用 **SQLite** 作为数据库，通过 **Prisma ORM** 进行数据建模与访问。数据库文件位于 `server/dev.db`。

数据库共包含 **8 张数据表** 和 **4 个枚举类型**，覆盖账户管理、分部管理、人员管理、数据记录、修改历史、奖励规则和系统通知等核心业务。

---

## 2. ER 关系图（文字描述）

```
┌──────────┐       ┌──────────┐       ┌──────────────┐
│  Account │       │  Branch  │       │  Personnel   │
│  (账户)  │◄─────►│  (分部)  │◄─────►│  (人员)      │
└────┬─────┘       └────┬─────┘       └──────┬───────┘
     │                  │                    │
     │                  │  ┌──────────────┐  │
     │                  ├─►│PersonnelBranch│◄─┤
     │                  │  │(人员-分部关联)│  │
     │                  │  └──────────────┘  │
     │                  │                    │
     │  ┌───────────┐   │  ┌───────────┐    │
     ├─►│DataRecord │◄──┼─►│DataRecord │◄───┤
     │  │(数据记录) │   │  │(数据记录) │    │
     │  └─────┬─────┘   │  └───────────┘    │
     │        │         │                    │
     │  ┌─────▼─────┐   │  ┌───────────┐    │
     └─►│DataHistory│   └─►│RewardRule │    │
        │(修改历史) │      │(奖励规则) │    │
        └───────────┘      └───────────┘    │
                              │              │
                          ┌───▼────┐         │
                          │Notification│◄─────┘
                          │(通知)   │
                          └─────────┘
```

### 核心关系说明

| 关系 | 类型 | 说明 |
|------|------|------|
| Account → Branch | 多对一 | 一个账户可属于一个分部（会长无分部） |
| Branch → Personnel | 多对多 | 通过 PersonnelBranch 关联表实现 |
| Account → DataRecord | 一对多 | 账户创建的数据记录（createdBy） |
| DataRecord → DataHistory | 一对多 | 一条数据记录的修改历史 |
| Account → DataHistory | 一对多 | 账户执行的修改操作（modifierId） |
| Branch → RewardRule | 一对一 | 每个分部有一套奖励规则 |
| Branch → Notification | 一对多 | 分部相关的系统通知 |

---

## 3. 枚举类型

### 3.1 Role（账户角色）

| 值 | 说明 | 权限 |
|----|------|------|
| `HUIZHANG` | 会长 | 系统最高权限，可管理所有分部、账户、规则 |
| `CHAOGUAN` | 超管 | 可管理本分部数据、规则及下属管理账户 |
| `GUANLI` | 管理 | 仅可录入和查看本分部数据 |

### 3.2 AccountStatus（账户状态）

| 值 | 说明 |
|----|------|
| `ACTIVE` | 正常（可登录） |
| `DISABLED` | 禁用（不可登录） |

### 3.3 HistoryAction（历史操作类型）

| 值 | 说明 |
|----|------|
| `UPDATE` | 修改操作 |
| `DELETE` | 删除操作 |

### 3.4 NotificationType（通知类型）

| 值 | 说明 |
|----|------|
| `RANK_PUBLISH` | 排名公布通知 |
| `RULE_CHANGE` | 规则变更通知 |
| `DATA_CHANGE` | 数据变更通知 |

---

## 4. 数据表结构

### 4.1 Account（账户表）

存储系统登录账户信息。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Int | 主键，自增 | 账户ID |
| username | String | 唯一，非空 | 登录用户名 |
| passwordHash | String | 非空 | bcrypt 加密的密码哈希 |
| role | Role | 非空 | 账户角色 |
| branchId | Int? | 外键 → Branch.id | 所属分部（会长为 null） |
| status | AccountStatus | 默认 ACTIVE | 账户状态 |
| createdAt | DateTime | 默认当前时间 | 创建时间 |
| updatedAt | DateTime | 自动更新 | 更新时间 |

**索引：**
- `@@unique([username])` — 用户名唯一约束
- `@@index([branchId])` — 按分部查询账户

---

### 4.2 Branch（分部表）

存储分部信息。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Int | 主键，自增 | 分部ID |
| name | String | 非空 | 分部名称 |
| createdAt | DateTime | 默认当前时间 | 创建时间 |

**关联：** accounts、personnelBranches、dataRecords、rewardRules、notifications

---

### 4.3 Personnel（人员表）

存储人员名单信息。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Int | 主键，自增 | 人员ID |
| name | String | 非空 | 人员姓名 |
| createdAt | DateTime | 默认当前时间 | 创建时间 |

**关联：** personnelBranches、dataRecords

---

### 4.4 PersonnelBranch（人员-分部关联表）

实现人员与分部的多对多关系。一个人员可属于多个分部。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Int | 主键，自增 | 关联ID |
| personnelId | Int | 外键 → Personnel.id | 人员ID |
| branchId | Int | 外键 → Branch.id | 分部ID |
| createdAt | DateTime | 默认当前时间 | 创建时间 |

**索引：**
- `@@unique([personnelId, branchId])` — 联合唯一约束，防止重复关联
- `@@index([branchId])` — 按分部查询人员

---

### 4.5 DataRecord（数据记录表）

存储每周的人员数据记录，是系统的核心业务表。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Int | 主键，自增 | 记录ID |
| personnelId | Int | 外键 → Personnel.id | 人员ID |
| branchId | Int | 外键 → Branch.id | 分部ID |
| weekStart | DateTime | 非空 | 所属周周一日期（00:00:00） |
| sg | Int | 默认 0 | 收光数量 |
| mx | Int | 默认 0 | 麦序数量 |
| qm | Int | 默认 0 | 全麦数量 |
| createdBy | Int | 外键 → Account.id | 创建者账户ID |
| createdAt | DateTime | 默认当前时间 | 创建时间 |
| updatedAt | DateTime | 自动更新 | 更新时间 |

**索引：**
- `@@index([personnelId])` — 按人员查询
- `@@index([branchId])` — 按分部查询
- `@@index([weekStart])` — 按周查询
- `@@index([createdBy])` — 按创建者查询
- `@@index([weekStart, branchId])` — 组合索引：按周+分部查询（最常用场景）
- `@@index([weekStart, branchId, personnelId])` — 组合索引：按周+分部+人员精确查询
- `@@index([branchId, personnelId])` — 组合索引：按分部+人员查询

---

### 4.6 DataHistory（修改历史表）

记录数据记录的修改与删除操作，用于审计追踪。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Int | 主键，自增 | 历史ID |
| recordId | Int? | 外键 → DataRecord.id, onDelete: SetNull | 关联记录ID（记录被删除后置空） |
| modifierId | Int | 外键 → Account.id | 修改者账户ID |
| modifyTime | DateTime | 默认当前时间 | 修改时间 |
| action | HistoryAction | 非空 | 操作类型（UPDATE/DELETE） |
| field | String? | 可空 | 修改的字段名 |
| oldValue | String? | 可空 | 修改前的值 |
| newValue | String? | 可空 | 修改后的值 |

**索引：**
- `@@index([recordId])` — 按记录查询历史
- `@@index([modifierId])` — 按修改者查询历史

---

### 4.7 RewardRule（奖励规则表）

存储每个分部的福利计算规则，每个分部一套规则。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | Int | 主键，自增 | — | 规则ID |
| branchId | Int | 唯一，外键 → Branch.id | — | 所属分部 |
| sgRatio | Int | — | 3 | 收光转换比例 |
| qmRatio | Int | — | 3 | 全麦转换比例 |
| rank1Reward | Int | — | 100 | 第1名奖励 |
| rank2Reward | Int | — | 80 | 第2名奖励 |
| rank3Reward | Int | — | 60 | 第3名奖励 |
| maixuThreshold | Int | — | 40 | 麦序达标阈值 |
| maixuReward | Int | — | 52 | 麦序达标奖励 |
| createdAt | DateTime | — | 当前时间 | 创建时间 |
| updatedAt | DateTime | — | 自动更新 | 更新时间 |

**约束：** `@@unique([branchId])` — 每个分部仅一套规则

---

### 4.8 Notification（通知表）

存储系统通知消息。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | Int | 主键，自增 | 通知ID |
| branchId | Int | 外键 → Branch.id | 所属分部 |
| type | NotificationType | 非空 | 通知类型 |
| content | String | 非空 | 通知内容 |
| isRead | Boolean | 默认 false | 是否已读 |
| createdAt | DateTime | 默认当前时间 | 创建时间 |

**索引：** `@@index([branchId])` — 按分部查询通知

---

## 5. 福利计算公式

系统根据 DataRecord 和 RewardRule 计算每周福利：

### 5.1 基础福利

```
基础福利 = 收光(sg) × 收光比例(sgRatio) + 全麦(qm) × 全麦比例(qmRatio)
```

### 5.2 排名奖励

按分部分组，分部内按麦序(mx)降序排名：

| 排名 | 奖励 |
|------|------|
| 第1名 | rank1Reward（默认 100） |
| 第2名 | rank2Reward（默认 80） |
| 第3名 | rank3Reward（默认 60） |
| 第4名及以后，麦序 ≥ maixuThreshold | maixuReward（默认 52） |
| 第4名及以后，麦序 < maixuThreshold | 0 |

### 5.3 总福利

```
总福利 = 基础福利 + 排名奖励
```

---

## 6. 数据库迁移

迁移文件位于 `server/prisma/migrations/` 目录：

| 迁移 | 说明 |
|------|------|
| `20260624134406_init` | 初始建表 |
| `20260624142335_data_history_optional_record` | DataHistory.recordId 改为可选 |
| `20260624150332_add_indexes` | 添加 DataRecord 组合索引 |

### 创建新迁移

```bash
cd server
npx prisma migrate dev --name <迁移名称>
```

### 部署迁移到生产

```bash
cd server
npx prisma migrate deploy
```
