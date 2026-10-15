# 前端架构：组件边界、状态提升与渲染性能

在现代前端架构里，组件边界（component boundary）从来不只是文件划分的问题，它同时决定了 state 的归属以及重渲染的影响范围。一个实用的经验是：当两个 sibling 组件都需要读取同一份 state 时，就应该把状态提升（lifting state up）到它们最近的公共父节点，而不是各自维护一份容易失同步的副本。

## 组件职责的拆分原则

拆分组件时，我通常先问三个问题：

- 这段 UI 是否会独立地变化？
- 它依赖的数据是否只来自 props？
- 它的重渲染是否会拖累无关的兄弟节点？

只要三个问题里有任意一个答案含糊，就说明边界画得不对。一个只负责展示的 presentational component 不应该直接调用 API，否则它会同时承担数据获取与渲染两种职责，单元测试时也很难把这个组件隔离出来。

## 状态提升与单向数据流

单向数据流（one-way data flow）是 React 生态里最重要的约束之一：父组件通过 props 向下传递数据，子组件通过回调向上通知变更。代价是 props drilling，一旦层级过深，就会被迫引入 context 或外部的 store 来缓解。

| 方案 | 适用场景 | 主要代价 |
| --- | --- | --- |
| props 传递 | 层级浅、数据量小 | 嵌套变深后冗长 |
| context | theme、locale 等全局配置 | 高频变更会触发大范围重渲染 |
| 外部 store | 高频更新、跨路由共享 | 需要额外的心智模型 |

选择哪一种并没有绝对答案，关键看更新的频率与订阅的粒度。

## 渲染性能的治理

性能问题往往不是「渲染太慢」，而是「渲染了本不该渲染的子树」。打开 React DevTools 的 Profiler 之后，可以很快定位到 commit 时间异常的组件。常见的优化手段包括 React.memo、把稳定的回调交给 useCallback，以及为列表项提供稳定且唯一的 key。

> 过早优化是万恶之源，但过晚优化同样昂贵——先测量，再下结论。

```ts
const Row = React.memo(function Row(props: RowProps) {
  return <li>{props.label}</li>;
});

function List({ items }: { items: Item[] }) {
  return (
    <ul>
      {items.map((it) => (
        <Row key={it.id} label={it.label} />
      ))}
    </ul>
  );
}
```

需要警惕的是，memo 只在 props 引用稳定时才有效。如果每次渲染都新建一个对象字面量传进去，那么这层 memo 就形同虚设。虚拟列表（virtual list）则是另一条路线：只把视口内的行渲染出来，让 DOM 节点的数量控制在一个常数级。

## 小结

组件边界的本质是数据边界。先把 state 放到最合适的位置，再谈缓存与 memo；顺序一旦颠倒，后面所有的性能优化都只是在给架构打补丁。
