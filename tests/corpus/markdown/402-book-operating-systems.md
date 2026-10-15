# Chapter 3 — Processes, Scheduling and Virtual Memory

An operating system exists to share scarce hardware safely among many programs that
would each like to believe they own the machine. This chapter follows that goal
through three layers. Section §1 defines what a process is and how it differs from
a thread. Section §2 describes what happens during a context switch, the moment the
illusion of ownership is suspended. Section §3 develops CPU scheduling, including
the metrics and the arithmetic that lets us compare policies. Section §4 turns to
virtual memory, where the same illusion is applied to the address space itself, and
§5 ties the two together with the cost model that explains why real systems are
built the way they are. A summary and exercises close the chapter.

## 1. Processes and threads

A **process** is a running program together with everything the kernel tracks on its
behalf: an address space, open file descriptors, a program counter, registers, a
stack, and accounting information. A **thread** is an execution stream inside a
process. Threads in the same process share the address space and file descriptors
but have their own registers and stack.

### 1.1 The process control block

The kernel keeps one process control block (PCB) per process. Its fields are the
kernel's memory of "who this program is":

- Process identifier and parent identifier.
- Saved register context, including the program counter and stack pointer.
- A pointer to the page table that describes the address space.
- Scheduling state: priority, consumed CPU time, recent wakeup history.
- File descriptor table and signal handlers.

When you read `ps` or `/proc/self/status` on a POSIX system, you are looking at a
human-readable projection of the PCB.

### 1.2 Life cycle and states

A process moves through a small state machine. The three durable states are ready,
running and blocked; the transitions are the interesting part.

```
              admitted            dispatched
     new  ───────────►  ready  ──────────────►  running
                         ▲  ◄────────────────     │
                 I/O or  │      preempted         │ terminate
                 event   │                        ▼
   blocked  ◄─────────────┼───────────────    terminated
     │  wait               
     └──────────────► ready  (I/O complete)
```

Two transitions deserve emphasis. **Preemption** is the kernel taking the CPU away
from a running process that has not asked to yield; without it, a program stuck in a
long computation would starve every other process. **Blocking** is a process
voluntarily leaving the running state because it cannot proceed, typically waiting
for I/O. The distinction matters because a blocked process consumes no CPU, while a
ready process is competing for it.

### 1.3 Threads versus processes

| Aspect           | Process                    | Thread                     |
| ---------------- | -------------------------- | -------------------------- |
| Address space    | Private by default         | Shared with siblings       |
| Creation cost    | High (page tables, copy)   | Low (a stack and registers) |
| Communication    | IPC, pipes, shared memory  | Direct shared variables    |
| Fault isolation  | Strong; a crash is contained | Weak; any thread can corrupt |
| Context switch   | Expensive (TLB flush)      | Cheaper if same address space |

The rule that follows is simple: reach for threads when tasks must share large data
and can tolerate mutual trust; reach for processes when isolation is worth the cost.

## 2. Context switching

A context switch saves the hardware state of the running thread and restores that of
another. The kernel runs this code in a privileged mode where it can touch the saved
registers and the page table root register.

### 2.1 What is saved

```c
struct context {
    uint64_t rax, rbx, rcx, rdx;
    uint64_t rsi, rdi, rbp;
    uint64_t rsp;      /* stack pointer */
    uint64_t rip;      /* return address / program counter */
    uint64_t rflags;
};
```

This is the minimum needed to resume execution later. Floating-point and vector
registers may be saved lazily, because a process that never used them does not need
them restored.

### 2.2 The hidden cost: the TLB

Saving registers is fast, on the order of hundreds of nanoseconds. The larger cost is
the translation lookaside buffer (TLB), the small cache of virtual-to-physical
mappings. When the page table root changes, most TLB entries become invalid and the
following instructions miss on translation. On modern hardware this can dominate the
switch cost. This is one reason thread switches within the same address space are
cheaper than process switches, and one reason kernels tag TLB entries with an
address-space identifier so that some entries survive.

## 3. CPU scheduling

The scheduler decides which ready thread runs next. Its objective is a weighted
mixture of the metrics in §3.1; the policies in §3.2 optimise different parts of that
mixture.

### 3.1 Metrics

We assume a workload of threads with arrival times and **burst times** (the CPU time
each needs before it either finishes or blocks).

- **Turnaround time** is completion time minus arrival time.
- **Waiting time** is turnaround time minus burst time.
- **Response time** is the time until the thread first gets the CPU.
- **Throughput** is completed threads per unit time.
- **Fairness** cannot be reduced to a single number and is usually argued informally.

Most scheduling questions reduce to a small arithmetic exercise, so let us set one
up. Consider three threads that all arrive at time $0$:

| Thread | Arrival | Burst |
| ------ | ------- | ----- |
| P1     | 0       | 7     |
| P2     | 0       | 4     |
| P3     | 0       | 1     |

Under **first come first served** in the order P1, P2, P3 the completion times are
$7, 11, 12$ and the average waiting time is

$$
\frac{0 + 7 + 11}{3} = 6 .
$$

Under **shortest job first** in the order P3, P2, P1 the completion times are
$1, 5, 12$ and the average waiting time is

$$
\frac{0 + 1 + 5}{3} = 2 .
$$

The gap is the whole point: ordering by burst time is provably optimal for average
waiting time when all jobs arrive at once. Shortest job first is a special case of the
exchange argument: if two adjacent jobs $a$ then $b$ satisfy $t_a > t_b$, swapping
them reduces total waiting time, so the optimal order has nondecreasing bursts.

### 3.2 Policies

- **Round robin** gives each thread a fixed quantum $q$ and cycles through the ready
  queue. It is fair and provides the best response time when $q$ is small, but many
  short quanta mean many context switches.
- **Priority scheduling** always runs the highest-priority ready thread. It risks
  starvation, cured by **aging**: increase the priority of a thread the longer it waits.
- **Multilevel feedback queues** approximate shortest job first without knowing burst
  times in advance, by demoting threads that consume their whole quantum.
- **Completely fair scheduling** gives each thread a virtual runtime that advances with
  the physical time it consumes, weighted by its nice value, and always runs the thread
  with the smallest virtual runtime.

### 3.3 The round-robin quantum

Round robin has one tunable parameter, the quantum $q$. The overhead fraction is

$$
f = \frac{c}{q + c},
$$

where $c$ is the context switch cost. If $c = 0.1\,\mathrm{ms}$ and we require
$f \le 0.01$, then

$$
q \ge \frac{c(1-f)}{f} = \frac{0.1 \times 0.99}{0.01} = 9.9\,\mathrm{ms},
$$

so a quantum of about $10\,\mathrm{ms}$ keeps overhead under one percent. But a
quantum that large hurts interactivity: a thread that becomes ready may wait up to a
full quantum. Table 2 collects the trade-offs.

### 3.4 Comparison

| Policy              | Preemptive | Starvation | Avg. waiting     | Response  | Typical use          |
| ------------------- | ---------- | ---------- | ---------------- | --------- | -------------------- |
| FCFS                | No         | No         | Poor (convoy)    | Poor      | Batch queues         |
| SJF                 | No         | Yes        | Optimal          | Good      | Theory baseline      |
| Round robin         | Yes        | No         | Moderate         | Excellent | Time sharing         |
| Priority + aging    | Yes        | No         | Depends          | Depends   | Real-time mixes      |
| CFS                 | Yes        | No         | Good             | Good      | Desktop, servers     |

> The convoy effect deserves a name because it is the failure mode students
> remember: one long job at the head of an FCFS queue makes every short job behind it
> wait, and the machine looks idle even though it is busy.

## 4. Virtual memory

Virtual memory gives every process a private, contiguous-looking address space that
the memory management unit translates to physical frames. The translation is done in
fixed-size units called pages, typically $4\,\mathrm{KiB}$.

### 4.1 Paging arithmetic

A virtual address splits into a page number and an offset. With page size
$2^p$ bytes the offset occupies $p$ bits, so

$$
\text{virtual pages} = 2^{\,v - p}, \qquad \text{frame offset bits} = p .
$$

For a 48-bit virtual address and $4\,\mathrm{KiB}$ pages, $p = 12$ and the number of
virtual pages is $2^{36}$, far more than any machine has physical frames. That
discrepancy is exactly why we need demand paging: the page table describes the whole
address space, but only the working set need be resident.

### 4.2 Effective access time

Bill the cost of a memory access that may fault. Let $h$ be the hit ratio in the TLB,
$t_{m}$ the memory access time, and $t_{f}$ the fault service time. Then

$$
\mathrm{EAT} = h\,t_{m} + (1-h)\bigl(t_{m} + \text{fault penalty}\bigr).
$$

If we absorb the fault cost into a single penalty term $P$, this becomes

$$
\mathrm{EAT} = t_{m} + (1-h)P .
$$

With $t_{m} = 100\,\mathrm{ns}$ and a page fault penalty of $8\,\mathrm{ms}$
($8{\times}10^6\,\mathrm{ns}$), even a fault rate of $10^{-6}$ adds

$$
10^{-6} \times 8{\times}10^6 = 8\,\mathrm{ns},
$$

an extra eight percent. At a fault rate of $10^{-4}$ the penalty is $800\,\mathrm{ns}$,
eight times the base access. This arithmetic is why page fault rates dominate virtual
memory design far more than TLB miss rates do.

### 4.3 Page replacement

When a fault occurs and no free frame exists, the kernel evicts a page. The policies
mirror the scheduling policies of §3.2.

- **FIFO** evicts the oldest loaded page; it can suffer Belady's anomaly, where adding
  frames increases faults.
- **LRU** evicts the least recently used page and is close to optimal for temporal
  locality, but exact LRU is too expensive to implement.
- **Clock** approximates LRU with a reference bit per frame and a sweeping hand, at
  $O(1)$ amortised cost.
- **Working set** keeps every page referenced within a recent window $\tau$, protecting
  locality at the price of needing a larger resident set.

### 4.4 A page table walk

Multi-level page tables keep the table itself sparse. A four-level walk on x86-64
reads four translation entries before it reaches the data page.

```
  virtual address (48 bits)
  ┌────────┬────────┬────────┬────────┬────────────┐
  │ L4 idx │ L3 idx │ L2 idx │ L1 idx │ offset 12b │
  └───┬────┴───┬────┴───┬────┴───┬────┴────────────┘
      ▼        ▼        ▼        ▼
   PML4  →  PDPT  →  PD  →  PT  →  frame  →  data
```

Without the TLB, each memory access would become five memory accesses. The TLB exists
precisely to short-circuit this walk, which is why the effective access time formula
of §4.2 puts $h$ front and centre.

## 5. Putting the layers together

Scheduling and virtual memory interact more than the chapter's structure suggests.
A context switch that changes the page table root also perturbs the TLB (§2.2),
and a thrashing workload can keep a process blocked on I/O long enough for the
scheduler to demote it (§3.2). A system tuned for throughput will therefore choose
larger quanta and a larger resident set, while a system tuned for interactivity will
do the opposite. The two knobs trade against each other through the same arithmetic
we have already derived.

> A useful mental model: the scheduler decides *who* runs, and the memory manager
> decides *how fast* the chosen thread actually runs because of translation and
> faults. Optimising one while ignoring the other is how machines end up busy but
> slow.

## 6. Summary

This chapter described how an operating system manufactures the illusion of a
dedicated machine. Section §1 defined processes and threads and gave the process
life cycle. Section §2 explained context switching and identified the TLB as its
dominant hidden cost. Section §3 formalised scheduling metrics, worked the average
waiting time arithmetic for FCFS and SJF, derived the round-robin quantum bound, and
compared policies in a table. Section §4 introduced paging, derived the effective
access time, surveyed replacement policies, and showed why multi-level page tables
need a TLB. Section §5 tied scheduling and memory management into one cost model.

## 7. Exercises

1. Three threads arrive at times $0, 1, 2$ with bursts $8, 2, 4$. Compute the average
   waiting time under FCFS and under SJF (assuming no preemption).
2. Show by exchange argument that SJF minimises average waiting time when all threads
   arrive together.
3. For a context switch cost of $c = 5\,\mu\mathrm{s}$ and a target overhead of 2%,
   what quantum does round robin need?
4. Explain the convoy effect with a concrete burst-time sequence.
5. With a TLB hit ratio of $0.98$, $t_m = 100\,\mathrm{ns}$ and a fault penalty of
   $10\,\mathrm{ms}$, compute the expected access time if the fault rate is $10^{-5}$.
6. Why can a thread switch within a process avoid a TLB flush while a process switch
   cannot?
7. Construct a reference string on which FIFO causes Belady's anomaly.
8. Describe the clock algorithm and argue that its amortised cost is $O(1)$.
9. A 39-bit virtual address uses $4\,\mathrm{KiB}$ pages. How many bits are in the page
   number, and how many entries does a single-level page table need?
10. Give one workload where a large time quantum is clearly the right choice and one
    where a small quantum is clearly right. Justify each in terms of the metrics of §3.1.
