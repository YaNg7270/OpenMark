# 数据库实验指导

本实验的目标是把课堂上的关系理论落到一次可复现的实践上：从建表到查询，再到通过执行计划判断查询为什么慢。整个过程强调可观测性，任何性能结论都必须有执行计划或实测数据支撑，而不是凭经验猜测。

## 实验环境与准备

先准备一个可重复的数据库实例，避免使用共享环境，否则实验结果无法归因。

1. 安装并启动数据库服务，确认端口与字符集配置。
2. 创建专用的实验库与实验用户，只授予必要权限。
3. 记录版本号与关键配置项，作为结果的一部分。

```bash
createdb lab_shop
psql -d lab_shop -c "select version();"
psql -d lab_shop -c "show work_mem;"
```

版本与配置必须写入实验记录，因为不同版本的优化器行为可能差异明显，脱离版本谈计划没有意义。

## 建立表结构

先定义一张订单表与一张订单明细表，二者通过外键关联。

```sql
create table orders (
  order_id    bigint primary key,
  customer_id bigint not null,
  status      text not null,
  created_at  timestamp not null
);

create table order_items (
  order_id  bigint not null references orders(order_id),
  line_no   int not null,
  qty       int not null,
  price     numeric(12,2) not null,
  primary key (order_id, line_no)
);
```

| 表 | 主键 | 预期访问模式 |
| --- | --- | --- |
| orders | 单列主键 | 按客户与时间范围检索 |
| order_items | 复合主键 | 按订单号批量取明细 |

复合主键的顺序决定了索引能支持哪些前缀查询。把订单号放在首位，是因为绝大多数查询都从订单出发。

## 数据装载

为获得有意义的计划，需要装载足够的数据量。小表上的计划往往退化为顺序扫描，无法反映真实瓶颈。

```bash
psql -d lab_shop -f gen_data.sql
psql -d lab_shop -c "analyze orders;"
psql -d lab_shop -c "analyze order_items;"
```

装载后必须统计信息，否则优化器对行数的估计会严重失真，从而选出糟糕的连接顺序。

## 查询与执行计划

逐一编写查询，并在每条查询前加上计划关键字查看真实执行过程。

- 关注选择率与连接方式，嵌套循环适合小结果集，哈希连接适合大结果集。
- 注意是否存在重复扫描同一张表，这往往可以通过改写查询或增加索引消除。

```sql
explain (analyze, buffers)
select c.customer_id, sum(i.qty * i.price) as amount
from orders c
join order_items i on i.order_id = c.order_id
where c.created_at >= timestamp '2025-01-01'
  and c.status = 'paid'
group by c.customer_id
order by amount desc
limit 20;
```

> 计划里的估计行数与实际行数是排查性能问题最直接的证据。只报告耗时而不看计划，等于放弃了全部诊断信息。

## 结果分析与优化

对比优化前后的计划与耗时，逐条说明改动命中或未命中预期的原因。

1. 为过滤条件建立索引，确认计划是否改用索引扫描。
2. 调整条件顺序或重写聚合方式，观察连接顺序的变化。
3. 记录每组改动的前后耗时，避免把多个变量同时改变而无法归因。

实验报告应当包含环境、数据规模、原始查询、执行计划要点与结论。若某项优化没有效果，如实记录同样有价值，因为它划定了该手段的适用边界。
