# Chapter 4 — 机器学习基础：从线性回归到 Regularization

机器学习 machine learning 的核心问题可以一句话概括：给定一批 observed data，如何
学到一个 function，使它在 unseen data 上也有好的 generalization performance。本章
沿着最简单的 supervised learning 路径展开：先从 linear regression 建立 hypothesis
与 loss 的概念（§1），再用 gradient descent 讨论优化优化过程（§2），接着引入
regularization 控制 model complexity（§3），最后在 §4 讨论 bias–variance 与评估。
本章小结与练习在末尾。

## 1. 线性回归 Linear Regression

### 1.1 模型假设 Model Assumptions

设 training set 包含 $n$ 个样本，每个样本有 $d$ 个 features。我们用一个 linear
hypothesis 来拟合 target：

$$
\hat{y} = \mathbf{w}^\top \mathbf{x} + b,
$$

其中 $\mathbf{w} \in \mathbb{R}^d$ 是 weight vector，$b \in \mathbb{R}$ 是 bias。
这个假设隐含了三件事：第一，feature 与 target 之间的关系是 additive 的；第二，
每个 feature 的影响是 linear 的；第三，noise 被假定为 independent 且 mean 为 0。
If any of these assumptions is badly violated, the model will be systematically wrong
no matter how much data you feed it —— 这就是所谓的 model misspecification。

### 1.2 最小二乘 Least Squares

最常用的 loss 是 mean squared error (MSE)：

$$
L(\mathbf{w}, b) = \frac{1}{n} \sum_{i=1}^{n} \bigl(y_i - (\mathbf{w}^\top \mathbf{x}_i + b)\bigr)^2 .
$$

为什么选 squared error 而不是 absolute error？从 probabilistic 的角度看，如果 noise
服从 Gaussian distribution $\varepsilon \sim \mathcal{N}(0,\sigma^2)$，那么最大化
likelihood 就等价于最小化 MSE：

$$
p(y \mid \mathbf{x}) = \frac{1}{\sqrt{2\pi}\sigma}
\exp\!\left(-\frac{(y - \mathbf{w}^\top\mathbf{x})^2}{2\sigma^2}\right).
$$

把 product of likelihoods 取 log，二次项正好就是 MSE。从优化的角度看，MSE 是 convex
的，存在 closed-form solution；而 absolute error 的 gradient 在 0 点不可导。

### 1.3 闭式解 Closed Form

把 bias 吸收进 $\mathbf{w}$（在 $\mathbf{x}$ 前加一列常数 1），并把所有样本按行堆成
design matrix $X \in \mathbb{R}^{n \times (d+1)}$，则 loss 的 gradient 为

$$
\nabla_{\mathbf{w}} L = \frac{2}{n} X^\top (X\mathbf{w} - \mathbf{y}).
$$

令其为零，得到 normal equations：

$$
X^\top X \mathbf{w} = X^\top \mathbf{y}
\quad\Longrightarrow\quad
\mathbf{w}^\star = (X^\top X)^{-1} X^\top \mathbf{y}.
$$

这个公式漂亮，但有两个实际问题：当 $d$ 很大时，求逆的代价是 $O(d^3)$；当 feature
collinear 时，$X^\top X$ 接近 singular，numerical stability 很差。§2 的 gradient
descent 与 §3 的 regularization 分别针对这两个问题。

| 方法 | 复杂度 | 数值稳定性 | 适用场景 |
| ---- | ------ | ---------- | -------- |
| 正规方程 | $O(d^3)$ | 依赖条件数 | 中小规模、特征少 |
| 梯度下降 | $O(nd)$ 每轮 | 稳定 | 大规模、稀疏 |
| 随机梯度下降 | $O(d)$ 每步 | 稳定但方差大 | 在线与流式 |

### 1.4 特征工程与多项式特征 Feature Engineering

线性模型的表达能力受限于 feature 的构造。若 target 与输入之间是曲线关系，可以先对
feature 做非线性变换，再交给线性模型。例如把一维输入 $x$ 扩展为 $(x, x^2, x^3)$，
就得到 polynomial regression：它关于参数仍然是线性的，因此 §1.3 的闭式解与 §2 的
gradient descent 都照常适用。

设原始 feature 维度为 $d$，二次多项式扩展后的维度为

$$
\binom{d+2}{2} = \frac{(d+1)(d+2)}{2},
$$

维度按 $d^2$ 增长。这正是过拟合的温床，也是 §3 正则化存在的原因之一。

## 2. 梯度下降 Gradient Descent

### 2.1 更新规则 Update Rule

Gradient descent 沿着 loss 的负梯度方向迭代：

$$
\mathbf{w}_{t+1} = \mathbf{w}_t - \eta\, \nabla_{\mathbf{w}} L(\mathbf{w}_t),
$$

其中 $\eta > 0$ 是 learning rate。Intuitively, the gradient points uphill, so we step
downhill. 学习率过大导致 divergence，过小则收敛缓慢。对于 convex 且 $L$-smooth 的
目标函数，若 $\eta \le 1/L$，则每步都保证 loss 不增。

### 2.2 三种变体 Three Variants

- **Batch gradient descent** 每步用全部 $n$ 个样本计算梯度，方向最准，但每步代价是 $O(nd)$。
- **Stochastic gradient descent (SGD)** 每步只用 1 个样本，更新极快，但梯度噪声大，
  loss 曲线会震荡。
- **Mini-batch gradient descent** 用 $B$ 个样本，兼顾吞吐与噪声，是深度学习里的事实
  标准。Batch size $B$ 越大，梯度的方差越小，但每步代价线性增长。

### 2.3 收敛与条件数 Convergence

对 quadratic loss，gradient descent 的收敛速率由 Hessian 的 condition number
$\kappa = \lambda_{\max}/\lambda_{\min}$ 决定。误差每轮最多缩小

$$
\left(1 - \frac{1}{\kappa}\right) \text{ 倍},
$$

因此条件数越大，收敛越慢。Feature scaling（例如标准化到 zero mean、unit variance）
可以把 $\kappa$ 显著压低，这是数据预处理里最便宜也最有效的技巧之一。参见 §3，
ridge regression 通过给 Hessian 加 $\lambda I$ 也改善了 condition number。

```python
import numpy as np

def gradient_descent(X, y, lr=0.01, epochs=1000):
    n, d = X.shape
    w = np.zeros(d)
    for _ in range(epochs):
        grad = (2.0 / n) * X.T @ (X @ w - y)
        w -= lr * grad
    return w
```

### 2.4 动量与自适应方法 Momentum and Adaptive Methods

朴素梯度下降在「峡谷」型的 loss 地貌里会来回震荡。Momentum 累积历史梯度：

$$
\mathbf{v}_{t+1} = \beta \mathbf{v}_t + \nabla L(\mathbf{w}_t), \qquad
\mathbf{w}_{t+1} = \mathbf{w}_t - \eta \mathbf{v}_{t+1},
$$

其中 $\beta$ 通常取 $0.9$。它让方向一致的维度加速，方向反复的维度被平均掉。Adam
进一步为每个参数维护一阶矩与二阶矩的 running estimate，相当于给每个维度自适应地
调整学习率，因此在 sparse feature 上表现尤其好。For a gentle start, momentum alone
often closes most of the gap with far less tuning.

### 2.5 学习率调度与收敛诊断

固定学习率往往不是最优的，实践中常用三种调度：

- **步进衰减**：每经过若干 epoch 把 $\eta$ 乘以一个小于 1 的因子。
- **余弦退火**：让 $\eta$ 沿余弦曲线从大到小衰减，末期再做小幅回升。
- **预热**：训练初期让 $\eta$ 从小到大逐渐增大，避免早期梯度噪声破坏参数。

诊断收敛最常用的信号是 loss 曲线。若 training loss 持续下降而 validation loss 回升，
说明开始过拟合，应当提前停止或加强正则化；若 loss 剧烈震荡，多半是学习率过大；
若 loss 几乎不动，则可能是学习率过小或梯度消失。

## 3. 正则化 Regularization

### 3.1 过拟合与复杂度 Overfitting

当 model capacity 远大于 data 的信息量时，模型会把 training set 的噪声也背下来，
training error 很低而 test error 很高。控制复杂度的两条路是：减少参数数量，或者
约束参数的大小。Regularization 走的是第二条路，在 loss 上加一个 penalty：

$$
L_{\text{reg}}(\mathbf{w}) = L(\mathbf{w}) + \lambda R(\mathbf{w}).
$$

Hyperparameter $\lambda \ge 0$ 控制约束强度，$\lambda = 0$ 退化为原来的经验风险
最小化。参见 §4，$\lambda$ 的选择直接影响 bias–variance 的平衡。

### 3.2 L2 正则与 Ridge

取 $R(\mathbf{w}) = \|\mathbf{w}\|_2^2$，得到 ridge regression：

$$
\mathbf{w}^\star = (X^\top X + \lambda I)^{-1} X^\top \mathbf{y}.
$$

这里 $\lambda I$ 让矩阵一定可逆，即使 $X^\top X$ 奇异，因此 ridge 解决了 §1.3 提到的
numerical stability 问题。L2 会把所有系数都往 0 压，但不置零，权重分布更平滑。

### 3.3 L1 正则与 Lasso

取 $R(\mathbf{w}) = \|\mathbf{w}\|_1 = \sum_j |w_j|$，得到 lasso。L1 的几何形状是菱形，
其尖角落在坐标轴上，因此最优解常常有若干系数**恰好为零**，产生 sparse model，自带
feature selection 的效果。表 2 对比两者。

| 正则项 | 名称 | 解的性质 | 稀疏性 | 闭式解 |
| ------ | ---- | -------- | ------ | ------ |
| $\|\mathbf{w}\|_2^2$ | Ridge | 系数整体缩小 | 否 | 有 |
| $\|\mathbf{w}\|_1$ | Lasso | 部分系数归零 | 是 | 无，需迭代 |
| 两者混合 | Elastic Net | 兼顾 | 部分 | 无 |

### 3.4 从约束视角看

正则化也可以写成 constrained optimization：

$$
\min_{\mathbf{w}} L(\mathbf{w}) \quad \text{s.t.} \quad \|\mathbf{w}\|_2 \le t .
$$

由 Lagrange 对偶，约束半径 $t$ 与罚项系数 $\lambda$ 一一对应。这个视角解释了为什么
L1 产生稀疏解：在二维平面里，L1 的可行域是旋转过的正方形，loss 的等高线与它的角
相切的概率远高于与边相切。

```python
def ridge_fit(X, y, lam):
    d = X.shape[1]
    A = X.T @ X + lam * np.eye(d)
    return np.linalg.solve(A, X.T @ y)
```

### 3.5 早停与 Dropout

正则化不一定要写进 loss。**早停**（early stopping）在验证误差开始上升时停止训练，
等价于把参数限制在初始值附近的一个小邻域内，从而起到与 L2 类似的作用。**Dropout**
在训练时以概率 $p$ 随机把神经元输出置零，迫使网络不依赖任何单个单元，可以看作对
大量子网络的隐式集成。两者都不改变目标函数，却都显著降低 variance。

## 4. 偏差、方差与评估 Bias, Variance and Evaluation

模型的期望泛化误差可以分解为

$$
\mathbb{E}[(y - \hat{y})^2] = \text{Bias}^2 + \text{Variance} + \sigma^2,
$$

其中 $\sigma^2$ 是数据本身的不可约噪声。Increasing model capacity lowers bias but
raises variance; regularization does the opposite. $\lambda$ 越大，bias 越高、variance
越低，因此存在一个最优的 $\lambda$。

实践中用 cross-validation 选择 $\lambda$：把数据分成 $k$ 折，轮流留一折作验证，
取平均性能最好的一组超参数。这个流程比单纯看 training error 可靠得多，因为它
直接估计的是 generalization error。

> 一句常被引用的话：All models are wrong, but some are useful. 正则化并不追求让
> 模型「正确」，而是让它在训练数据之外依然可用。

## 5. 评估指标与模型选择 Model Selection

### 5.1 回归与分类的常用指标

不同任务需要不同的指标。回归常用均方根误差与平均绝对误差：

$$
\mathrm{RMSE} = \sqrt{\frac{1}{n}\sum_{i=1}^n (y_i - \hat{y}_i)^2}, \qquad
\mathrm{MAE} = \frac{1}{n}\sum_{i=1}^n \lvert y_i - \hat{y}_i \rvert .
$$

分类常用精确率 precision、召回率 recall 与 F1：

$$
\text{precision} = \frac{TP}{TP + FP}, \quad
\text{recall} = \frac{TP}{TP + FN}, \quad
F_1 = \frac{2 \cdot \text{precision} \cdot \text{recall}}{\text{precision} + \text{recall}} .
$$

准确率在类别极不平衡时会严重误导：把所有样本都判为多数类的模型可以拿到很高的
准确率却毫无用处。这正是 precision 与 recall 存在的理由。

| 指标 | 关注点 | 适用场景 |
| ---- | ------ | -------- |
| 准确率 | 整体正确比例 | 类别均衡 |
| 精确率 | 预测为正的可靠性 | 误报代价高 |
| 召回率 | 找出正例的能力 | 漏报代价高 |
| F1 | 两者的调和平均 | 需要折中 |
| RMSE | 大误差惩罚重 | 回归任务 |

### 5.2 训练集、验证集与测试集

数据必须分成三份：训练集用于拟合参数，验证集用于选择超参数（例如 §3 的 $\lambda$），
测试集只在最后使用一次，用来估计真实的泛化误差。反复在测试集上调参会让它退化成
另一个验证集，得到的分数会过于乐观。

### 5.3 模型选择的不确定性

交叉验证给出的是泛化误差的一个估计，它本身也有方差：数据量小时，不同折之间的结果
可能相差很大。因此比较两个模型时，除了比较平均分，还应报告标准差，必要时用统计
检验判断差距是否显著。选择模型时偏好更简单的那个，除非复杂模型在多个折上都稳定
更好——这正是 §4 的 bias–variance 权衡在实践中的落地方式。

## 6. 本章小结 Summary

本章从最简单的 linear regression 出发，建立了 hypothesis、loss 与 optimal solution
的完整链条。§1 给出 MSE 的概率解释与正规方程，并指出其数值与计算上的限制；§2 引入
gradient descent，讨论学习率、三种变体、条件数对收敛的影响以及 momentum 与 Adam；
§3 用 ridge 与 lasso 说明 regularization 如何在 bias 与 variance 之间做取舍；§4 给出
偏差-方差分解与 cross-validation 的实践流程；§5 给出评估指标与模型选择的注意事项。
至此，你已经拥有一条从建模到评估的最小完整路径。

## 7. 练习 Exercises

1. 推导 Gaussian noise 下 maximum likelihood 等价于最小化 MSE 的完整过程。
2. 写出 $1 \times 1$ 情形下正规方程的解，并与直接求导对照。
3. 对 $L(\mathbf{w}) = \|\mathbf{X}\mathbf{w} - \mathbf{y}\|^2$ 求 Hessian，说明它是
   convex 的。
4. 给定 condition number $\kappa = 100$，估计梯度下降误差缩小一半需要多少轮。
5. 比较 batch、stochastic 与 mini-batch 三种方法在每步代价与梯度方差上的差异。
6. 从 constrained optimization 的 Lagrange 对偶推导出 ridge 的闭式解。
7. 解释为什么 lasso 产生稀疏解，而 ridge 不会。
8. 用 bias–variance 分解说明 $\lambda$ 增大时 test error 的变化趋势。
9. 写出 $k$-fold cross-validation 的伪代码，并说明它估计的是哪个量。
10. 给出一个 feature collinear 的例子，说明此时正规方程的数值问题。
