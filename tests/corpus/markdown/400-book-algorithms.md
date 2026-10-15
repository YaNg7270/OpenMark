# Chapter 1 — Sorting, Searching and the Cost of Order

Every program that stores more than a handful of records eventually asks the same
two questions: how do I put this data in order, and how do I find one item again
without scanning the whole collection. This chapter answers both, and it does so
by treating the answers as engineering artefacts: we care about the algorithm, the
constant factors around it, and the memory it touches. Section §1 fixes the
vocabulary of cost. Section §2 develops mergesort as a model of predictable
behaviour. Section §3 turns to quicksort, its average-case promise and its
worst-case trap. Section §4 covers binary search and the discipline of sorted
input. Section §5 compares the methods side by side, and §6 collects the
practical advice. As always, a summary and a set of exercises close the chapter.

## 1. The vocabulary of cost

We measure algorithms with the asymptotic notation that Donald Knuth popularised.
For a function of the input size $n$, the three most useful classes are

$$
O(1) \subset O(\log n) \subset O(n) \subset O(n \log n) \subset O(n^2).
$$

The subset relation is not a statement about speed; it is a statement about growth.
An $O(n \log n)$ algorithm can lose to an $O(n^2)$ one on a small input, because
asymptotics hide the constant factor. A useful rule of thumb is that constant
factors decide battles below a few hundred elements and complexity classes decide
wars above a few thousand.

### 1.1 Counting comparisons

The standard model for a sorting algorithm treats a comparison of two keys as the
unit of work, and everything else — swaps, index updates, loop bookkeeping — as
cheap extra. Under that model we can prove a lower bound. There are $n!$ possible
permutations of $n$ distinct keys, and a comparison tree with binary branching and
height $h$ can distinguish at most $2^h$ outcomes, so any comparison sort needs

$$
2^h \ge n! \quad\Longrightarrow\quad h \ge \log_2(n!) = \Theta(n \log n).
$$

The takeaway is that no comparison sort can beat $\Theta(n \log n)$ in the worst
case. Algorithms that appear to break this bound, such as counting sort or radix
sort, do so by refusing to compare keys at all.

### 1.2 Space, stability and in-place trade-offs

Two properties matter as much as running time:

- **Stability.** A sort is stable when records that compare equal keep their
  original relative order. Stability lets you sort by a secondary key first and a
  primary key second, and have the result sorted correctly by both.
- **In-place operation.** An algorithm is in place when it uses $O(1)$ auxiliary
  memory beyond the input, or $O(\log n)$ for a recursion stack that we are willing
  to forgive.

Quicksort is in place but not stable; mergesort is stable but wants $O(n)$ scratch
space; heapsort is in place and unstable. No comparison sort is simultaneously
stable and in place at $O(1)$ extra space, which is why standard libraries offer a
menu rather than a single answer.

## 2. Mergesort: the predictable baseline

Mergesort splits the array in half, sorts each half by calling itself, and then
merges the two sorted halves. The recursion has depth $\lceil \log_2 n \rceil$, and
each level performs $O(n)$ work in the merge step, giving the recurrence

$$
T(n) = 2T(n/2) + \Theta(n) = \Theta(n \log n).
$$

The beauty of mergesort is that the bound is *worst case and best case at once*:
the recursion tree is the same shape for every input. If you need a guaranteed
deadline, mergesort is the safe choice.

### 2.1 The merge step

The merge step is where the auxiliary memory goes. Given two sorted runs `a` and
`b`, we walk both with a read pointer and copy the smaller front element into an
output buffer. Because we never overwrite unread input, the buffer must be a
separate array of size $n$.

```python
def merge(a, b):
    out = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:     # <= keeps the sort stable
            out.append(a[i]); i += 1
        else:
            out.append(b[j]); j += 1
    out.extend(a[i:])
    out.extend(b[j:])
    return out

def mergesort(xs):
    if len(xs) < 2:
        return xs
    mid = len(xs) // 2
    return merge(mergesort(xs[:mid]), mergesort(xs[mid:]))
```

The comparison `a[i] <= b[j]` is deliberately non-strict. Using `<` instead would
break stability, because an element from the right run would be emitted before an
equal element from the left run.

### 2.2 Bottom-up mergesort

The recursive version allocates a new list per level on some implementations. A
production variant iterates over run widths instead, allocating a single scratch
buffer once:

```python
def mergesort_bu(xs):
    n = len(xs)
    buf = [0] * n
    width = 1
    while width < n:
        for lo in range(0, n, 2 * width):
            mid = min(lo + width, n)
            hi = min(lo + 2 * width, n)
            _merge_into(xs, buf, lo, mid, hi)
        width *= 2
    return xs
```

This version is friendly to caches because it processes long contiguous stretches
once the run width grows past the cache line.

## 3. Quicksort: speed and the pivot problem

Quicksort picks a pivot, partitions the array so that smaller elements come before
it and larger ones after, and recurses on the two sides. Expected time is
$O(n \log n)$ and the constant is small, which is why it dominates practical
sorting libraries. The catch is the pivot.

### 3.1 Partitioning with Lomuto's scheme

The simplest partition walks a single index forward and swaps any element smaller
than the pivot into a growing region on the left.

```python
def partition(a, lo, hi):
    pivot = a[hi]          # last element as pivot
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    return i
```

Lomuto's scheme is easy to prove correct but performs more swaps than Hoare's
two-pointer scheme. Hoare's partition is favoured in performance-critical code.

### 3.2 Why pivots determine everything

If the pivot splits the array into two parts of sizes $k-1$ and $n-k$, the
recurrence is

$$
T(n) = T(k-1) + T(n-k) + \Theta(n).
$$

When the split is balanced, $k \approx n/2$, this resolves to $\Theta(n \log n)$.
When the pivot is always the minimum, the split is $0$ and $n-1$, and the
recurrence degenerates to

$$
T(n) = T(n-1) + \Theta(n) = \Theta(n^2),
$$

which happens on already-sorted input if you naively choose the first or last
element. The remedies are well known:

- Choose the pivot at random, so no fixed input can trigger the bad case.
- Choose the median of first, middle and last elements, which costs almost nothing.
- Fall back to insertion sort on small subarrays, where its low overhead wins.

### 3.3 The average case

Suppose every permutation is equally likely and we always pick a random pivot. The
probability that a particular pair of elements is ever compared is $2/(j-i+1)$ where
$i$ and $j$ are their ranks, and summing over all pairs gives the expected number of
comparisons:

$$
\sum_{i<j} \frac{2}{j-i+1} = 2\sum_{k=1}^{n-1}\frac{n-k}{k+1} = \Theta(n \log n).
$$

So quicksort's bad case is a real possibility but not a typical one; randomisation
makes the adversary's job impossible.

## 4. Binary search and the contract of order

If the data is already sorted, searching is nearly free. Binary search halves the
candidate range at each step, so it needs at most $\lceil \log_2 n \rceil + 1$
comparisons.

### 4.1 The classic loop

```python
def bisect_right(a, x):
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] <= x:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

Getting the invariant right is the whole game. The version above maintains
two facts: everything before `lo` is $\le x$, and everything at or after `hi` is
$> x$. When the loop ends, `lo == hi` is the insertion point.

### 4.2 Off-by-one as a discipline

Binary search is notorious for being written correctly by only a small fraction of
programmers on the first try. The classic bugs are

1. Using `(lo + hi) // 2` on a fixed-width integer where `lo + hi` can overflow.
2. Mixing inclusive and exclusive bounds in the same function.
3. Forgetting that the postcondition is an insertion point, not always a found index.

A robust habit is to decide the invariant in words, then transcribe the words into
the `if` branches. Changing from `<=` to `<` moves the answer from the rightmost to
the leftmost occurrence, which is exactly the difference between `bisect_right` and
`bisect_left`.

### 4.3 Searching trees and hash tables for contrast

Binary search assumes random access. On a linked structure we use a balanced tree,
where lookup costs $O(\log n)$ but with a larger constant. When keys are hashable
and the access pattern is uniform, a hash table offers expected $O(1)$ lookup and
throws away order entirely. Table 1 below summarises the trade-offs.

| Structure    | Lookup        | Insert        | Ordered traversal | Notes                    |
| ------------ | ------------- | ------------- | ----------------- | ------------------------ |
| Sorted array | $O(\log n)$   | $O(n)$        | Yes               | Cache friendly           |
| Hash table   | $O(1)$ avg    | $O(1)$ avg    | No                | Needs a good hash        |
| B-tree       | $O(\log n)$   | $O(\log n)$   | Yes               | Block storage friendly   |
| Skip list    | $O(\log n)$   | $O(\log n)$   | Yes               | Simple concurrent design |

## 5. A comparison of the sorts

Table 2 collects the numbers we have derived. Read `n log n` as the asymptotic
class, not a stopwatch reading.

| Algorithm  | Best       | Average    | Worst      | Space  | Stable |
| ---------- | ---------- | ---------- | ---------- | ------ | ------ |
| Mergesort  | n log n    | n log n    | n log n    | n      | Yes    |
| Quicksort  | n log n    | n log n    | n^2        | log n  | No     |
| Heapsort   | n log n    | n log n    | n log n    | 1      | No     |
| Insertion  | n          | n^2        | n^2        | 1      | Yes    |
| Counting   | n + k      | n + k      | n + k      | k      | Yes    |

Notice how heapsort sits in the middle: worst-case $O(n \log n)$, constant space,
but poor cache locality because it jumps around the array. Real libraries
therefore reach for a hybrid: introsort runs quicksort until the recursion gets too
deep, then switches to heapsort to guarantee the bound, and uses insertion sort for
the small tail.

## 6. Practical guidance

The theoretical bounds are only the first filter. When you pick an algorithm in a
real system, work through this checklist:

- **Do you actually need a full sort?** A selection problem like "give me the top
  ten" is $O(n)$ with quickselect, not $O(n \log n)$.
- **Is the input nearly sorted?** Adaptive sorts such as Timsort exploit existing
  runs and approach $O(n)$ on such input.
- **Are the keys small integers?** Counting sort or radix sort can beat every
  comparison sort by a wide margin.
- **Does the comparison cost dominate?** If each comparison calls out to the disk or
  the network, minimising comparison count matters more than swap count.
- **Is stability required?** Sorting records by two keys in sequence demands it.

A final warning about benchmarks. Micro-benchmarks of sorting are notoriously
misleading: branch prediction, cache line size and the distribution of input data
all move the numbers by factors that dwarf the asymptotic difference on modest
sizes. Measure on your data, on your machine, with the sizes you actually see.

> Correctness is not negotiable, but neither is the measurement. An algorithm that
> is provably optimal and ten times slower on your workload is the wrong choice.

## 7. 本章小结 / Summary

This chapter developed the core of ordered data handling. We established the
$\Theta(n \log n)$ comparison lower bound and the counting model that produces it.
Mergesort gave us a guaranteed $O(n \log n)$ sort at the cost of linear scratch
space. Quicksort gave us the fastest practical sort, with $O(n \log n)$ expected
time and an $O(n^2)$ worst case that randomisation reduces to an unlucky event.
Binary search showed that precomputed order converts a linear scan into a
logarithmic probe, provided the loop invariant is stated with care. Table 2
summarised the trade-offs and §6 turned them into a selection checklist.

## 8. 练习 / Exercises

1. Prove by induction that the merge step produces a sorted output when its inputs
   are sorted.
2. Show that quicksort on an already sorted array with the first element as pivot
   performs exactly $n(n-1)/2$ comparisons.
3. Implement `bisect_left` and verify that it differs from `bisect_right` only on
   keys that occur more than once.
4. Which of the sorts in Table 2 are stable? Justify each answer from the merge or
   partition rule.
5. Derive the expected depth of the recursion tree for randomised quicksort.
6. A radix sort on $b$-bit integers processes one digit of $d$ bits per pass. How
   many passes does it need, and what is the total cost?
7. Explain why heapsort has worse cache behaviour than mergesort despite the same
   asymptotic complexity.
8. Design an algorithm that finds the median of $n$ numbers in expected linear time
   and state its worst-case bound.
9. Timsort finds and merges existing runs. On an array that is already sorted, how
   many comparisons does it need?
10. Argue why no comparison-based sort can be simultaneously stable and in place in
    $O(1)$ auxiliary space.
