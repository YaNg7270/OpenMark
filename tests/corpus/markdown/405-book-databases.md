# Chapter 6 — Relational Modelling, Normalisation and Query Planning

A database is a promise: the data you store will still mean the same thing tomorrow,
and a query will return all of it and nothing else. This chapter explains how that
promise is kept. Section §1 establishes the relational model and the language of
keys. Section §2 develops normalisation, the discipline that removes redundancy and
the update anomalies that come with it. Section §3 covers the SQL statements that
express the model, and §4 descends into the query planner, where a declarative
statement becomes an executable plan and where the cost arithmetic lives. Section §5
discusses indexes, the physical structure that makes the plan cheap. The summary and
exercises close the chapter.

## 1. The relational model

### 1.1 Relations, tuples and attributes

A **relation** is a set of tuples over a fixed set of named attributes. Each attribute
has a domain, the set of values it may take. A relation with attributes
$\{A_1,\dots,A_n\}$ is written $R(A_1,\dots,A_n)$. Because a relation is a *set*,
duplicate tuples are impossible in the pure model; real systems add multiset semantics
and let `UNION ALL` preserve duplicates.

The model is valuable precisely because it is small. Everything you can express is
some combination of selection, projection, join, union and difference, and those
operations compose without surprising you.

### 1.2 Keys

- A **superkey** is any attribute set whose values uniquely identify a tuple.
- A **candidate key** is a minimal superkey; no proper subset of it is a superkey.
- The **primary key** is the candidate key chosen as the identity of the relation.
- A **foreign key** is an attribute set in one relation that references a candidate key
  in another, and the database enforces that the reference always resolves.

Keys are not bookkeeping. They are the statements of fact that let the engine build
indexes, choose join orders, and reject updates that would break the model.

### 1.3 Relationships

A foreign key induces a relationship with a cardinality: one-to-one, one-to-many or
many-to-many. Many-to-many relationships cannot be stored in one relation without
violating first normal form; they are decomposed into a **junction** (or associative)
relation whose primary key is the pair of foreign keys.

| Relationship | Where stored              | Example                    |
| ------------ | ------------------------- | -------------------------- |
| One-to-one   | Foreign key on either side | User and Passport         |
| One-to-many  | Foreign key on the many side | Customer and Order      |
| Many-to-many | Bridge relation           | Student and Course         |

## 2. Normalisation

### 2.1 Functional dependencies

Write $X \to Y$ to mean that whenever two tuples agree on the attributes $X$, they
also agree on $Y$. A functional dependency is a constraint the data must satisfy.
From a set $F$ of dependencies we can derive others with Armstrong's axioms:

- **Reflexivity**: if $Y \subseteq X$ then $X \to Y$.
- **Augmentation**: if $X \to Y$ then $XZ \to YZ$.
- **Transitivity**: if $X \to Y$ and $Y \to Z$ then $X \to Z$.

The closure $X^+$ of an attribute set is everything it functionally determines. A
superkey is exactly an attribute set whose closure contains every attribute. This
gives a mechanical test for candidate keys, which is far more reliable than eyeballing
a schema.

### 2.2 Normal forms

Normalisation proceeds by splitting relations until every dependency is "well placed".

**First normal form (1NF)** requires that every attribute hold a single atomic value.
A column holding a comma-separated list of tags violates 1NF.

**Second normal form (2NF)** requires 1NF plus no *partial* dependency: no non-key
attribute may depend on only part of a composite candidate key.

**Third normal form (3NF)** requires 2NF plus no *transitive* dependency: no non-key
attribute may determine another non-key attribute. Formally, for every nontrivial
$X \to A$, either $X$ is a superkey or $A$ is a prime attribute.

**Boyce–Codd normal form (BCNF)** removes the "or $A$ is prime" escape hatch from 3NF.
For every nontrivial $X \to A$, $X$ must be a superkey.

### 2.3 A worked decomposition

Consider the relation

```
Enrolment(student_id, course_id, student_name, course_title, instructor)
```

with dependencies

$$
\text{student\_id} \to \text{student\_name},\qquad
\text{course\_id} \to \text{course\_title},\qquad
\text{course\_id} \to \text{instructor}.
$$

The only candidate key is $\{\text{student\_id}, \text{course\_id}\}$. The dependency
`course_id -> course_title` is a partial dependency because `course_id` is a proper
subset of the key, so the relation is not in 2NF. We split it:

| Relation  | Attributes                                              |
| --------- | ------------------------------------------------------ |
| Student   | student_id, student_name                               |
| Course    | course_id, course_title, instructor                    |
| Takes     | student_id, course_id                                  |

Each resulting relation is in BCNF, and the redundancy that would have let one course
title disagree with itself in two rows is gone.

### 2.4 When to stop normalising

Normalisation is not free. Every split adds a join to every query that needs the
combined view. A reporting warehouse, where writes are batched and queries scan
millions of rows, will deliberately denormalise into a star schema: one fact table
surrounded by dimension tables, with redundant copies of descriptive attributes to
avoid joins. The engineering judgement is simple — normalise until write anomalies
are unacceptable, denormalise until read latency is acceptable, and document the
redundancy you chose so that whoever maintains it knows the invariant.

> The classical anomalies that motivate 3NF are the update anomaly (one fact stored
> twice must be changed twice), the insert anomaly (you cannot record a fact without
> inventing an unrelated tuple), and the delete anomaly (deleting one fact destroys
> another). Every one of them is a symptom of storing a dependency in the wrong place.

## 3. SQL as the surface language

SQL is a declarative language: you describe the result set, and the planner decides
how to compute it. The core of it is a small algebra with a friendly syntax.

### 3.1 The query skeleton

```sql
SELECT   s.name, COUNT(*) AS n
FROM     student AS s
JOIN     takes   AS t ON t.student_id = s.student_id
WHERE    s.enrolled_on >= DATE '2024-01-01'
GROUP BY s.name
HAVING   COUNT(*) > 3
ORDER BY n DESC
LIMIT    10;
```

Logical evaluation order is not the written order. The engine first forms the
cross-product, then filters with `WHERE`, then groups, then filters groups with
`HAVING`, then projects, then sorts and limits. Confusing `WHERE` and `HAVING` is a
classic mistake: `WHERE` runs before aggregation and cannot reference aggregate
results.

### 3.2 Data definition and integrity

```sql
CREATE TABLE takes (
    student_id INTEGER NOT NULL REFERENCES student(student_id),
    course_id  INTEGER NOT NULL REFERENCES course(course_id),
    grade      NUMERIC(3,1) CHECK (grade >= 0 AND grade <= 10),
    PRIMARY KEY (student_id, course_id)
);
```

Declaring the primary key and foreign keys does more than document intent; it gives
the planner information it uses to reorder joins and eliminate redundant ones.

### 3.3 Set operations and nulls

`UNION` removes duplicates, `UNION ALL` does not. Three-valued logic means comparisons
with `NULL` yield `UNKNOWN`, so `WHERE grade <> 5` quietly drops rows whose grade is
`NULL`, and `COUNT(grade)` skips them while `COUNT(*)` does not. Getting null semantics
right is a frequent source of wrong reports.

## 4. Query planning

### 4.1 From SQL to a plan

The planner rewrites the logical plan and then searches for a physical plan with low
estimated cost. Its inputs are statistics: row counts, distinct value counts, and
value histograms for each column.

### 4.2 Selectivity and cardinality estimation

For an equality predicate on a column with $n_R$ rows and $V$ distinct values, the
standard estimator assumes uniformity and independence:

$$
\text{selectivity} = \frac{1}{V}, \qquad
\text{est. rows} = \frac{n_R}{V}.
$$

For a range predicate the same idea uses the histogram. Selectivities of independent
predicates multiply. This assumption is wrong whenever columns are correlated, which
is why estimators fail on skewed and dependent data, and why the planner sometimes
chooses a disastrous plan.

### 4.3 Join algorithms and their cost

Let $n_R$ and $n_S$ be the row counts and $B$ the number of pages per relation.

| Algorithm              | Cost            | Best when                        |
| ---------------------- | --------------- | -------------------------------- |
| Nested loop            | $n_R \cdot n_S$ | One side is tiny            |
| Block nested loop      | $B_R \cdot B_S$ | Memory is small                  |
| Sort–merge join        | $B\log B$       | Inputs already sorted            |
| Hash join              | $O(n_R + n_S)$  | Large equi-joins, memory fits    |
| Index nested loop      | $n_R \cdot \log n_S$ | An index exists on the inner side |

**Sort–merge join** sorts both inputs on the join key and then walks them. Its cost is
dominated by the sort, roughly $2B\log_2 B$ page reads for two-way merge sort. It
shines when the inputs are already sorted, as when an index provides the order.

**Hash join** builds a hash table on the smaller input, then probes it with the larger.
If the build side fits in memory the cost is a single linear pass over both inputs,
which is why hash joins dominate large analytical workloads.

### 4.4 Choosing a plan by cost

Suppose $n_R = 10{,}000$, $n_S = 100$, join keys are equality, and an index exists on
$S$'s key. The index nested loop cost is

$$
n_R \cdot \log_2 n_S = 10{,}000 \times 7 = 70{,}000 \text{ probes},
$$

while the hash join's build side is $n_S = 100$ rows. Building and probing costs about
$10{,}100$ operations, so the hash join is cheaper *provided* the fixed build overhead
is small. If instead $n_S$ were $10$ rows, the nested loop would win because the fixed
cost of building a hash table would exceed the savings.

The planner performs exactly this arithmetic, but with the danger that its estimates
can be off by orders of magnitude. This is why database tuning is far more about
statistics than about syntax.

## 5. Indexes

An index is a redundant structure that trades write cost and space for read speed.

- A **B+ tree index** supports equality and range predicates, keeps keys sorted, and
  has height $O(\log_B N)$ for branching factor $B$.
- A **hash index** supports equality only, but in expected $O(1)$.
- A **covering index** stores the queried columns in the index itself, so the engine
  never touches the table, eliminating the otherwise-mandatory random lookups.

An index on a low-selectivity column, such as a boolean flag, is usually worthless:
the planner will choose a sequential scan anyway, and you have paid the write cost for
nothing. Selectivity, not column order, decides whether an index pays.

```sql
CREATE INDEX takes_course_idx ON takes(course_id);
-- Supports: WHERE course_id = ? and the inner side of a nested loop join.
```

## 6. Transactions and Isolation

A query planner assumes the data does not change underneath it. Transactions are the
mechanism that makes this assumption true: a transaction groups statements so that they
either all take effect or none do.

### 6.1 ACID

- **Atomicity**: the group commits or aborts as a unit.
- **Consistency**: every committed state satisfies the declared constraints.
- **Isolation**: concurrent transactions do not observe each other's partial work.
- **Durability**: a committed transaction survives a crash.

### 6.2 Isolation levels and anomalies

Full serialisability is expensive, so SQL defines weaker levels and names the anomalies
each permits.

| Level            | Dirty read | Non-repeatable read | Phantom read |
| ---------------- | ---------- | ------------------- | ------------ |
| Read uncommitted | Possible   | Possible            | Possible     |
| Read committed   | No         | Possible            | Possible     |
| Repeatable read  | No         | No                  | Possible     |
| Serializable     | No         | No                  | No           |

### 6.3 Two-phase locking and versioning

The classic route to serialisability is two-phase locking: a transaction acquires locks
before it releases any, so its lock set only grows and then only shrinks. Lock conflicts
are resolved by waiting, which can deadlock; the engine detects the cycle and aborts one
victim. Multi-version concurrency control takes a different route, letting readers see a
consistent snapshot while writers create new versions, trading space for fewer waits.

Recall §5: versioned storage is part of why a covering index can serve a long read-only
query without blocking the writers that feed it.

## 7. Summary

This chapter followed a schema from idea to execution. Section §1 gave the relational
model and the vocabulary of keys. Section §2 defined functional dependencies and walked
1NF through BCNF, including a decomposition that removed a partial dependency.
Section §3 presented SQL as a declarative surface over the relational algebra, with
attention to evaluation order and nulls. Section §4 opened the planner: selectivities,
cardinality estimation, and the cost table for join algorithms, with a worked
comparison. Section §5 covered physical design through indexes and the selectivity
argument that decides whether an index pays for itself. Section §6 added transactions
and the isolation levels that keep concurrent readers and writers honest.

## 8. Exercises

1. Define the difference between a superkey and a candidate key with an example.
2. Given $R(A,B,C,D)$ with $A \to B$, $B \to C$, and $A \to D$, find all candidate keys.
3. Compute the closure of $\{A\}$ under the dependencies in exercise 2.
4. Explain, using the three anomalies, why the unnormalised `Enrolment` relation is
   undesirable.
5. Decompose a relation violating 3NF into BCNF relations and check each for dependency
   preservation.
6. Rewrite a query that mistakenly uses `WHERE COUNT(*) > 3` and explain the error.
7. With $n_R = 10^6$ and $V = 10^3$ distinct values, estimate the rows returned by an
   equality predicate assuming uniformity.
8. When is a sort–merge join preferable to a hash join, even though it is asymptotically
   more expensive?
9. Give a query that a covering index makes much faster and explain why it avoids a
   table lookup.
10. Explain why a planner with poor statistics might pick a nested loop join on two
    large relations.
