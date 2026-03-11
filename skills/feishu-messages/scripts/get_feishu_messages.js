const http = require("http");
const https = require("https");

// === 配置参数 ===
const args = process.argv.slice(2);
const config = {
  // 必需参数
  appID: "",
  appSecret: "",
  chatID: "",

  // 可选参数
  containerIDType: "chat", // chat 或 thread
  startTime: "", // 起始时间（YYYY-MM-DD hh:mm:ss 格式）
  endTime: "", // 结束时间（YYYY-MM-DD hh:mm:ss 格式）
  sortType: "ByCreateTimeDesc", // ByCreateTimeAsc 或 ByCreateTimeDesc
  pageSize: 50, // 分页大小 1-50
};

// 解析命令行参数
function parseArgs() {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--appid":
        config.appID = args[++i];
        break;
      case "--secret":
        config.appSecret = args[++i];
        break;
      case "--chatid":
        config.chatID = args[++i];
        break;
      case "--container-type":
        config.containerIDType = args[++i];
        break;
      case "--start-time":
        config.startTime = args[++i];
        break;
      case "--end-time":
        config.endTime = args[++i];
        break;
      case "--sort":
        config.sortType = args[++i];
        break;
      case "--page-size":
        config.pageSize = parseInt(args[++i]);
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
  }
}

// 解析时间字符串为毫秒时间戳
function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const timestamp = new Date(timeStr).getTime();
  return isNaN(timestamp) ? null : timestamp;
}

// 打印使用说明
function printUsage() {
  console.log(`
=== 飞书消息获取工具 ===

用法:
  node get_feishu_messages.js --appid <app_id> --secret <app_secret> --chatid <chat_id> [选项]

必需参数:
  --appid <app_id>           飞书应用 ID
  --secret <app_secret>       飞书应用密钥
  --chatid <chat_id>         群聊 ID 或话题 ID

可选参数:
  --container-type <type>    容器类型: chat(群聊/单聊) 或 thread(话题)，默认 chat
  --start-time <time>       起始时间（YYYY-MM-DD hh:mm:ss 格式）
  --end-time <time>         结束时间（YYYY-MM-DD hh:mm:ss 格式）
  --sort <sort_type>        排序方式:
                             ByCreateTimeAsc - 升序（最旧在前）
                             ByCreateTimeDesc - 降序（最新在前，默认）
  --page-size <size>        分页大小: 1-50，默认 50
  --help, -h                显示帮助信息

示例:
  node get_feishu_messages.js --appid xxx --secret xxx --chatid xxx
  node get_feishu_messages.js --appid xxx --secret xxx --chatid xxx --start-time "2021-01-01 00:00:00" --end-time "2021-01-31 23:59:59"
  node get_feishu_messages.js --appid xxx --secret xxx --chatid xxx --sort ByCreateTimeAsc --page-size 20
`);
}

// HTTP 请求封装
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const isHttps = options.hostname === "open.feishu.cn";
    const protocol = isHttps ? https : http;

    const req = protocol.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// 获取 tenant_access_token
async function getTenantAccessToken(appID, appSecret) {
  const options = {
    hostname: "open.feishu.cn",
    port: 443,
    path: "/open-apis/auth/v3/tenant_access_token/internal",
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  };

  const result = await request(options, {
    app_id: appID,
    app_secret: appSecret,
  });

  if (result.code !== 0) {
    throw new Error(`failed to get tenant_access_token: ${result.msg}`);
  }
  return result.tenant_access_token;
}

// 检查机器人是否在指定群聊中
async function checkIfBotInChat(tenantAccessToken, chatID) {
  const options = {
    hostname: "open.feishu.cn",
    port: 443,
    path: `/open-apis/im/v1/chats/${encodeURIComponent(chatID)}/members/is_in_chat`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  };

  const result = await request(options);

  if (result.code !== 0) {
    throw new Error(`failed to check if bot in chat: ${result.msg}`);
  }

  const isInChat = result.data.is_in_chat;
  return isInChat;
}

// 获取会话历史消息
async function getChatHistoryMessages(tenantAccessToken, options) {
  const { chatID, containerIDType, startTime, endTime, sortType, pageSize } = options;

  // 构建查询参数
  const params = new URLSearchParams({
    container_id_type: containerIDType,
    container_id: chatID,
    page_size: pageSize.toString(),
    sort_type: sortType,
  });

  // 添加时间筛选（转换为秒级时间戳）
  if (startTime) {
    params.append("start_time", Math.floor(parseInt(startTime) / 1000).toString());
  }
  if (endTime) {
    params.append("end_time", Math.floor(parseInt(endTime) / 1000).toString());
  }

  const optionsHttp = {
    hostname: "open.feishu.cn",
    port: 443,
    path: `/open-apis/im/v1/messages?${params.toString()}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  };

  const result = await request(optionsHttp);

  if (result.code !== 0) {
    throw new Error(`failed to get chat history messages: ${result.msg}`);
  }

  const messages = result.data.items || [];
  
  return messages;
}

// 格式化消息内容，转为易读字符串
function formatMessageContent(msgType, content, mentions = []) {
  if (!content) return "";

  let parsed = null;

  // 尝试解析 JSON 内容
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch (e) {
    // 不是 JSON，直接返回原内容
    return String(content);
  }

  // 根据消息类型处理
  switch (msgType) {
    case "text":
      return formatTextMessage(parsed, mentions);
    case "post":
      return formatPostMessage(parsed);
    case "image":
      return formatImageMessage(parsed);
    case "file":
      return formatFileMessage(parsed);
    case "share_chat":
      return formatShareChatMessage(parsed);
    case "share_user":
      return formatShareUserMessage(parsed);
    case "system":
      return formatSystemMessage(parsed);
    case "interactive":
      return `[卡片消息，暂不支持阅读]`;
    default:
      return JSON.stringify(parsed, null, 2);
  }
}

// 格式化纯文本消息，处理 mentions
function formatTextMessage(parsed, mentions = []) {
  if (typeof parsed === "string") {
    return parsed;
  }

  if (parsed.text) {
    let text = parsed.text;

    // 优先使用传入的 mentions 参数，否则使用 parsed.mentions
    const mentionList = mentions.length > 0 ? mentions : (parsed.mentions || []);

    // 替换 @_user_x 为真实用户名
    if (mentionList.length > 0) {
      // 替换所有匹配的 @_user_xxx 格式
      text = text.replace(/@_user_(\w+)/g, (match, id) => {
        const name = mentionList.find(m => m.key === `@_user_${id}`)?.name;
        return name ? `@${name}` : match;
      });
    }

    return text;
  }

  return JSON.stringify(parsed, null, 2);
}

// 格式化富文本消息
function formatPostMessage(parsed) {
  // 处理 content（可能是 title + content 或只有 content）
  if (parsed.content) {
    let result = "";

    // 如果有 title 且不为空
    if (parsed.title) {
      result = `【${parsed.title}】\n`;
    }

    const contents = Array.isArray(parsed.content) ? parsed.content : [parsed.content];
    contents.forEach((item) => {
      if (Array.isArray(item)) {
        item.forEach((element) => {
          result += formatPostElement(element);
        });
      } else if (typeof item === "object") {
        result += formatPostElement(item);
      } else {
        result += String(item);
      }
    });

    return result.trim() || JSON.stringify(parsed, null, 2);
  }

  if (parsed.elements) {
    let result = "";
    parsed.elements.forEach((element) => {
      // 处理数组的数组结构
      if (Array.isArray(element)) {
        element.forEach((el) => {
          result += formatPostElement(el);
        });
      } else {
        result += formatPostElement(element);
      }
    });
    return result.trim();
  }

  return JSON.stringify(parsed, null, 2);
}

// 格式化富文本元素
function formatPostElement(element) {
  if (!element) return "";

  if (element.tag === "text") {
    let text = element.text || "";
    if (element.text_tag === "inline_code") {
      return `\`${text}\``;
    }
    return text;
  }

  if (element.tag === "at") {
    return `@${element.name || element.user_id || "用户"}`;
  }

  if (element.tag === "a") {
    return `${element.text || ""} (${element.href || ""})`;
  }

  if (element.tag === "img") {
    const imageKey = element.image_key || element.smart_link || "unknown";
    return `\n[img:${imageKey}]\n`;
  }

  if (element.tag) {
    return `[${element.tag}元素]`;
  }

  return JSON.stringify(element, null, 2);
}

// 格式化图片消息
function formatImageMessage(parsed) {
  const imageKey = parsed.image_key || parsed.file_key || "unknown";
  return `[图片消息: imageKey=${imageKey}]`;
}

// 格式化文件消息
function formatFileMessage(parsed) {
  const fileName = parsed.file_name || parsed.name || "未知文件";
  const fileKey = parsed.file_key || "";
  return `[文件: ${fileName}] (key=${fileKey})`;
}

// 格式化分享群聊消息
function formatShareChatMessage(parsed) {
  const chatName = parsed.chat_name || parsed.shared_chat_id || "未知群聊";
  return `[分享群聊: ${chatName}]`;
}

// 格式化分享用户消息
function formatShareUserMessage(parsed) {
  const userName = parsed.user_name || parsed.user_id || "未知用户";
  return `[分享用户: ${userName}]`;
}

// 格式化系统消息
function formatSystemMessage(parsed) {
  if (parsed.text) {
    return parsed.text;
  }
  if (parsed.content) {
    try {
      const content = typeof parsed.content === "string" ? JSON.parse(parsed.content) : parsed.content;
      return content.text || JSON.stringify(content, null, 2);
    } catch (e) {
      return String(parsed.content);
    }
  }
  return JSON.stringify(parsed, null, 2);
}

// 格式化消息输出
function formatMessages(messages) {
  return messages.map((msg, index) => {
    const createTime = new Date(parseInt(msg.create_time)).toLocaleString("zh-CN");

    let mentions = msg.mentions || [];
    const formattedContent = formatMessageContent(msg.msg_type, msg.body?.content, mentions);

    return {
      index: index + 1,
      message_id: msg.message_id,
      sender_id: msg.sender?.id,
      sender_type: msg.sender?.sender_type,
      msg_type: msg.msg_type,
      create_time: createTime,
      content: formattedContent,
    };
  });
}

async function main() {
  parseArgs();

  // 检查必要参数
  if (!config.appID || !config.appSecret || !config.chatID) {
    console.error("错误: 缺少必要参数 (--appid, --secret, --chatid)\n");
    printUsage();
    process.exit(1);
  }

  // 验证 page_size
  if (config.pageSize < 1) {
    console.error("错误: --page-size 取值范围为 1-x");
    process.exit(1);
  }

  // 验证 sort_type
  if (!["ByCreateTimeAsc", "ByCreateTimeDesc"].includes(config.sortType)) {
    console.error("错误: --sort 必须是 ByCreateTimeAsc 或 ByCreateTimeDesc");
    process.exit(1);
  }

  // 验证 container_id_type
  if (!["chat", "thread"].includes(config.containerIDType)) {
    console.error("错误: --container-type 必须是 chat 或 thread");
    process.exit(1);
  }

  // 解析时间参数
  const startTimeMs = parseTimeString(config.startTime);
  const endTimeMs = parseTimeString(config.endTime);

  console.log("=== 飞书消息获取工具 ===");
  console.log(`App ID: ${config.appID}`);
  console.log(`Chat ID: ${config.chatID}`);
  console.log(`容器类型: ${config.containerIDType}`);
  if (startTimeMs) console.log(`起始时间: ${config.startTime} (${new Date(startTimeMs).toLocaleString("zh-CN")})`);
  if (endTimeMs) console.log(`结束时间: ${config.endTime} (${new Date(endTimeMs).toLocaleString("zh-CN")})`);
  console.log(`排序方式: ${config.sortType}`);
  console.log(`分页大小: ${config.pageSize}`);
  console.log("");

  // 传递给 API 的选项
  const apiOptions = {
    chatID: config.chatID,
    containerIDType: config.containerIDType,
    startTime: startTimeMs,
    endTime: endTimeMs,
    sortType: config.sortType,
    pageSize: config.pageSize,
  };

  try {
    // 获取 tenant_access_token
    const tenantAccessToken = await getTenantAccessToken(config.appID, config.appSecret);

    // 检查机器人是否在指定群聊中
    if (config.containerIDType === "chat") {
      const isInChat = await checkIfBotInChat(tenantAccessToken, config.chatID);
      if (!isInChat) {
        console.error("✗ 机器人不在指定群聊中，无法获取历史消息");
        process.exit(1);
      }
    }

    // 获取历史聊天记录
    const historyMessages = await getChatHistoryMessages(tenantAccessToken, apiOptions);

    // 格式化并输出消息
    const formattedMessages = formatMessages(historyMessages);

    // 输出 JSON 格式结果（方便其他程序解析）
    console.log(JSON.stringify(formattedMessages, null, 2));

  } catch (error) {
    console.error("\n✗ 执行过程中发生错误:", error.message);
    process.exit(1);
  }
}


main();
