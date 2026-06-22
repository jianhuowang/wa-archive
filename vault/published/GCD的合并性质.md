---
title: "GCD 的合并性质"
date: "2026-06-22"
tags: ["GCD", "数论", "动态规划"]
category: "算法笔记"
description: "从结合律出发理解后缀 GCD 的状态转移，为区间 GCD 类题目建立可复用的思考模型。"
---

# GCD 的合并性质

## 核心公式

$$
\gcd(a,b,c) = \gcd(\gcd(a,b),c)
$$

gcd 满足**结合律**：先算前两个的 gcd，再跟第三个取 gcd，结果一样。

## 后缀 gcd 的转移

定义 $f_i(j) = \gcd(a_j, a_{j+1}, \cdots, a_i)$，则：

$$
f_i(j) = \gcd(f_{i-1}(j), a_i)
$$

因为：

$$
\gcd(a_j,\cdots,a_{i-1},a_i) = \gcd(\gcd(a_j,\cdots,a_{i-1}), a_i)
$$

## 直观理解

> 所有以 $i$ 结尾的后缀 gcd
> = 单独的 $a[i]$
> + 所有以 $i-1$ 结尾的后缀 gcd 再接上 $a[i]$

很多 gcd DP 题的转移基础。
