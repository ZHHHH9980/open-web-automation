#!/usr/bin/env node

const { parseTask } = require("./executor");

const cases = [
  "Google 搜索 OpenAI GPT-4.1",
  "在知乎查看关注的博主",
  "在知乎找博主 陈丹青",
  "小红书搜索 露营攻略",
  "小红书发布笔记 标题: 周末露营 内容: 今天天气很好 图片:/tmp/a.png,/tmp/b.png",
  "回到首页",
];

for (const c of cases) {
  const parsed = parseTask(c);
  console.log(`TASK: ${c}`);
  console.log(JSON.stringify(parsed, null, 2));
  console.log("-");
}
