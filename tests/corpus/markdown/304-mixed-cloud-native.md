# 云原生：容器镜像、声明式配置与弹性伸缩

云原生（cloud native）并不是某一款产品，而是一整套围绕容器、声明式配置和自动化的工程实践。它要解决的核心问题是：如何让一个服务从「某台机器上跑着」变成「随时可以复制、迁移、扩容」的状态。容器镜像（container image）正是这个转变的起点。

## 容器镜像与不可变基础设施

镜像一旦构建完成就应当视为不可变（immutable）。每次改动都产出新 tag，绝不进入正在运行的容器里改文件，否则同一 tag 会对应两种不同的运行状态，排查问题时根本无从复现。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: registry.example.com/billing-api:1.8.2
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
```

分层缓存（layer cache）是构建速度的关键：把变动最频繁的源码拷贝放到 Dockerfile 的最后，把依赖安装放在前面，大部分重建就能命中缓存。

## 声明式配置

声明式（declarative）与命令式的区别在于：你描述「期望状态」，而不是「执行步骤」。控制器会不断把实际状态收敛到期望状态，这个过程叫 reconcile。

- 期望状态写在 YAML 里，进入版本控制；
- 实际状态由控制平面持续观测；
- 二者的差值驱动控制器反复调谐。

> 声明式系统的信心来自收敛循环，而不是来自一次成功的命令。

## 弹性伸缩

水平伸缩（horizontal scaling）通过增加副本数来分担流量，垂直伸缩（vertical scaling）则是提升单个 Pod 的配额。生产环境里更常用的是基于指标的 HPA，它会读取 CPU、内存甚至自定义指标来决定副本数量。

| 伸缩方式 | 调整对象 | 典型触发信号 |
| --- | --- | --- |
| HPA | 副本数 | CPU 利用率 |
| VPA | 资源 requests | 历史用量 |
| Cluster Autoscaler | 节点数 | 存在 pending Pod |

值得注意的是，扩容永远比缩容更急迫：缩容前通常要留一段冷却窗口，避免流量抖动导致副本数来回震荡。同时要把启动时间（startup time）压下来，否则新副本还没来得及就绪，流量高峰就已经过去。

## 小结

镜像负责可复制，声明式负责可收敛，伸缩负责可承压。三者缺一，云原生的收益都会大打折扣。
