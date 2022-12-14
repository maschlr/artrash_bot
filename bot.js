const { Buffer } = require('node:buffer');

const http =  require("serverless-http");
const { Telegraf, Telegram } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const dotenv = require('dotenv');
dotenv.config()

const {BOT_TOKEN, PREDICTOR_URL} = process.env

const bot = new Telegraf(BOT_TOKEN)
const api = new Telegram(BOT_TOKEN)

bot.command('quit', async (ctx) => {
  // Using context shortcut
  await ctx.leaveChat()
})

bot.on('message', async (ctx) => {
  const mime_type_pattern = /image\/.+/
  const message = ctx.update.message;
  // only process photos or messages containing images
  if (
    !(
      message.photo ||
      (message.document &&
        message.document.mime_type.match(mime_type_pattern))
    )
  ) {
    return
  }

  const fileId = message.document ? message.document.file_id : message.photo[2].file_id
  const file = await api.getFile(fileId)
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`

  const fileResponse = await fetch(fileUrl)
  const chunks = []
  const stream = fileResponse.body
  // 'stream' may be triggered multiple times as data is buffered in
  for await (const chunk of stream.iterator()) {
    chunks.push(chunk)
  }
  const buf = Buffer.concat(chunks)

  const mime_type = message.document ? message.document.mime_type : "image/jpeg"
  const predictionResponse = await fetch(
    PREDICTOR_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        data: [
          `data:${mime_type};base64,${buf.toString(
            'base64',
          )}`,
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    },
  )
  const result = await predictionResponse.json()

  const prediction = result.data[0]
  const labelToEmoji = {
    "modern conceptual art": "🎨",
    "junk": "🚮"
  }
  const listItems = prediction.confidences.map(
    (item) => `${labelToEmoji[item.label]} ${(item.confidence * 100).toFixed(2)} %`,
  )
  let responseMessage = `This is *${prediction.label}*\n`
  responseMessage += '\nConfidences:\n'
  responseMessage += listItems.join('\n')

  await ctx.replyWithMarkdown(responseMessage)
})

module.exports.predictor = http(bot.webhookCallback("/telegraf"));
//bot.launch()
