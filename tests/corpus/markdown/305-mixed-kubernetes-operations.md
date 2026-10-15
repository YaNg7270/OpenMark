# Kubernetes 运维：探针、资源配额与滚动更新

把服务搬上 Kubernetes 只是第一步，真正的运维难题在于：如何让集群准确知道一个容器「活着」「就绪」「还能撑得住」。这三个问题分别对应 liveness、readiness 与 resource 配置，任何一项配错，都会在流量高峰时被放大成故障。

## 三类探针

liveness 探针（liveness probe）失败时，kubelet 会重启容器，它的语义是「这个进程已经无可救药，请把它换掉」。

readiness 探针（readiness probe）失败时，Pod 会从 Service 的 Endpoints 里摘除，但不会被重启，它的语义是「暂时还接不了流量，先别发给我」。

startup 探针（startup probe）则专门保护启动慢的应用，在它成功之前，liveness 会被挂起，从而避免启动阶段被误杀。

1. liveness 的检查路径要足够轻，绝不能依赖下游数据库；
2. readiness 可以稍微重一点，但也要避免级联失败；
3. interval 与 failureThreshold 要结合 P99 响应时间一起调。

## 资源请求与限制

requests 决定调度器把 Pod 放到哪台节点，limits 决定它最多能用多少。

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "1"
    memory: "512Mi"
```

CPU 是压缩型资源（compressible），超限时只是被节流；内存是不可压缩的（incompressible），超过 limit 会直接触发 OOMKilled。因此内存的 requests 与 limits 通常设成相等，而 CPU 允许留出弹性空间。

| 资源 | 超限行为 | 建议 |
| --- | --- | --- |
| CPU | 被 throttling | requests 略低于 limits |
| 内存 | OOMKilled | requests 等于 limits |

## 滚动更新与回滚

滚动更新（rolling update）通过 maxSurge 与 maxUnavailable 控制新旧副本的交替速度。理想的更新节奏是：先起新副本、等它就绪、再摘掉旧副本，全程不丢一个请求。

> 更新的安全性取决于 readiness 的准确性，探针骗了集群一次，用户就会替你付账。

回滚（rollback）依赖 Deployment 保留的 revision 历史，因此要把 `revisionHistoryLimit` 设成一个合理值，既不无限膨胀 etcd，也能随时退回上一个稳定版本。发布前用 `--dry-run=server` 做一次校验，可以拦住大部分 YAML 层面的低级错误。

## 小结

探针回答「要不要重启、要不要接流量」，配额回答「能分多少资源」，滚动更新回答「怎么换版本」。这三组配置共同决定了服务的稳定性下限。
