const fs = require('fs')

const path = 'src/modules/crm/conversations/views/ConversationsView.vue'
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/)

const start = lines.findIndex((l) => l.includes('<div class="chat-composer">'))
if (start < 0) throw new Error('chat-composer start not found')

let depth = 0
let end = -1
for (let i = start; i < lines.length; i += 1) {
  const line = lines[i]
  depth += (line.match(/<div/g) || []).length
  depth -= (line.match(/<\/div>/g) || []).length
  if (depth === 0) {
    end = i
    break
  }
}
if (end < 0) throw new Error('chat-composer end not found')

const block = [
  '        <div class="chat-composer">',
  '          <div v-if="replyTo" class="reply-preview">',
  '            <div class="reply-meta">',
  '              <span class="reply-name">{{ replyName }}</span>',
  '              <button class="reply-close" type="button" @click="clearReply">✕</button>',
  '            </div>',
  '            <div class="reply-snippet">',
  '              {{ buildReplySnippet(replyTo) }}',
  '            </div>',
  '          </div>',
  '          <div class="composer-input">',
  '            <textarea',
  '              v-model="draft"',
  '              class="input"',
  '              :placeholder="replyPlaceholder"',
  '              :disabled="!activeConversationId || sending"',
  '              rows="2"',
  '              @keydown.enter.exact.prevent="sendMessage"',
  '            ></textarea>',
  '          </div>',
  '          <div class="composer-actions">',
  '            <button class="icon-btn" type="button" :disabled="!activeConversationId || sending">',
  '              ...',
  '            </button>',
  '            <button',
  '              class="btn primary"',
  '              type="button"',
  '              :disabled="!activeConversationId || sending"',
  '              @click="sendMessage"',
  '            >',
  '              Enviar',
  '            </button>',
  '          </div>',
  '        </div>',
]

const newLines = [...lines.slice(0, start), ...block, ...lines.slice(end + 1)]
fs.writeFileSync(path, newLines.join('\n'))
console.log('composer block rewritten', start, end)
