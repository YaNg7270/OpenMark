# TypeScript 类型系统：泛型、条件类型与类型收窄

TypeScript 的类型系统是结构化的（structural typing），它只关心一个值「长什么样」，而不关心它来自哪个 class。这一点和 nominal typing 的语言差别很大：在 Java 里，两个字段完全相同的 interface 依然不能互相赋值；而在 TypeScript 里，只要 shape 兼容，赋值就是合法的。

## 泛型：把类型当作参数

泛型的核心价值在于把「类型」也当作参数来传递。写一个 identity 函数时，如果参数写死成 any，调用方就丢掉了全部类型信息；写成泛型 T，返回值才能和输入保持同样的类型。

```ts
function identity<T>(value: T): T {
  return value;
}

const n = identity(42);   // n: number
const s = identity("hi"); // s: string
```

泛型约束（generic constraint）则用来表达「这个类型参数至少要有某些成员」，常见写法是 `<T extends { id: string }>`。

## 条件类型与分发

条件类型（conditional type）让类型层面的 if/else 成为可能。配合 extends 与 infer，可以从既有类型里把内部结构「提取」出来，最典型的例子是内置的 `ReturnType`。

1. 先判断左侧类型是否可赋值给右侧类型；
2. 若可赋值，走 true 分支；
3. 否则走 false 分支，可以用 infer 捕获中间类型。

分发行为只作用于裸类型参数：当条件类型左边是一个 union，它会逐成员展开，这正是很多高级工具类型的基础。

| 工具类型 | 作用 | 依赖特性 |
| --- | --- | --- |
| Partial | 全部属性变可选 | mapped type |
| Pick | 按 key 取子集 | keyof |
| Exclude | 从联合中排除成员 | 条件类型分发 |

## 类型收窄

类型收窄（narrowing）是把联合类型逐步缩小到具体成员的过程。typeof、instanceof、in 以及判别字段（discriminant field）都是常见的收窄手段。

> 收窄不是运行时检查的替代品，它只是让编译器跟随你的控制流。

对可辨识联合（discriminated union）而言，只要在 switch 里穷尽所有 kind，编译器就会在 default 分支把类型推断为 never，从而帮你发现遗漏的分支。这种穷尽性检查（exhaustiveness check）在重构时尤其有价值，因为新增一个成员会立刻在编译期报错，而不是等到线上才暴露问题。

## 小结

泛型负责复用，条件类型负责变形，收窄负责在控制流中保持精度。三者组合起来，才能让类型系统既表达力强、又不会拖慢编译速度。
