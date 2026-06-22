---
title: "回文数构造：从暴力枚举到前半部分镜像"
date: "2026-06-21"
tags: ["字符串", "构造", "模拟", "C++"]
category: "算法笔记"
description: "记录回文构造题的核心观察、边界处理与一份可复用的 C++ 模板。"
difficulty: "钻石"
platform: "马蹄集"
status: "已通过"
---

## 题意

给定一个数字或数字长度，构造满足条件的回文数。真正需要处理的通常不是“回文”本身，而是奇偶长度、前导零和进位边界。

## 思路

回文串由它的前半部分唯一确定：复制左半边，再按长度的奇偶性镜像即可。

假设字符串为 `s`：

- 偶数长度：将左半部分完整翻转到右侧；
- 奇数长度：跳过中间字符，再翻转剩余左半部分。

这把搜索空间从完整字符串降到了前半部分。

## 易错点

1. 奇数长度时不要重复中心字符。
2. 数字语境下注意前导零是否合法。
3. 若要寻找“下一个回文数”，镜像后仍不够大，就需要给前半部分加一。

## 代码

```cpp
#include <algorithm>
#include <iostream>
#include <string>
using namespace std;

string makePalindrome(const string& left, bool oddLength) {
    string right = left;
    if (oddLength) right.pop_back();
    reverse(right.begin(), right.end());
    return left + right;
}

int main() {
    string left;
    bool oddLength;
    cin >> left >> oddLength;
    cout << makePalindrome(left, oddLength) << '\n';
}
```

## 复盘

最初容易把它当成枚举题，但“右半边没有自由度”才是关键。遇到对称结构，应优先寻找能够唯一决定整体的最小信息。

## 下次遇到怎么想

先问自己：**答案的哪一部分能够决定剩余部分？** 对回文来说，它就是前半边。
