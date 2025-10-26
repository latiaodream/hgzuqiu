# 皇冠投注 API 请求示例

以下内容整理自我们已抓到的真实网络请求，包含下注前必须经过的关键步骤以及对应的参数。格式均为 `application/x-www-form-urlencoded`。

## 1. 登录接口 `p=chk_login`

```
p=chk_login
langx=zh-cn
ver=2025-10-16-fix342_120
username=<皇冠账号>
password=<皇冠密码>
app=N
auto=CFHFID
blackbox=<生成的 BlackBox 字符串>
userAgent=<Base64 编码的 UA>
```

- **说明**：`msg=100` 或 `109` 表示登录成功，并会返回 `uid`、`mid` 等后续接口必需字段。

## 2. 赛事列表 `p=get_game_list`

```
p=get_game_list
uid=<登录获得的 uid>
ver=2025-10-16-fix342_120
langx=zh-cn
p3type=
date=
gtype=ft
showtype=live
rtype=rb
ltype=3
filter=
cupFantasy=N
sorttype=L
specialClick=
isFantasy=N
ts=<时间戳>
```

## 3. 获取最新赔率 `p=FT_order_view`

```
p=FT_order_view
uid=<登录获得的 uid>
ver=2025-10-16-fix342_120
langx=zh-cn
odd_f_type=H
gid=<比赛 GID>
gtype=FT
wtype=RM
chose_team=C
```

- **返回 (code=501)**：包含 `ioratio`、`ratio`、`con`、`gold_gmin`/`gold_gmax` 等下注必需字段。
- **注意**：这里一定要使用和下注一致的 `wtype`。滚球独赢用 `RM`，赛前独赢用 `M`。

## 4. 下注接口 `p=FT_bet`

```
p=FT_bet
uid=<登录获得的 uid>
ver=2025-10-16-fix342_120
langx=zh-cn
odd_f_type=H
golds=50
gid=<比赛 GID>
gtype=FT
wtype=RM
rtype=RMC
chose_team=C
ioratio=2
con=0
ratio=2000
autoOdd=Y
timestamp=<时间戳>
timestamp2=
isRB=Y
imp=N
ptype=
isYesterday=N
f=1R
```

- **返回成功 (code=560)**：包含 `ticket_id`、`nowcredit`、`gold` 等注单详情。
- **常见错误**：皇冠如果返回纯文本 `VariableStandard`，说明参数不被接受，需要确认 `wtype`、`rtype`、`con` 等是否与最新盘口匹配，或检查是否在下注前调用了 `FT_order_view`。

---

> ✅ 提示：系统自动化应当严格按照「登录 → get_game_list → FT_order_view → FT_bet」的顺序执行，并确保使用同一条会话 (uid)。
