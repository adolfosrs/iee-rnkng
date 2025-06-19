import axios from 'axios'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

import { database } from './firebase.js'

const timezoneBR = 'America/Sao_Paulo'

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK
const BISPER_WEBHOOK = process.env.BISPER_WEBHOOK

let namesDictionary

function formatMessage(ranking, recentReactions = []) {
  const sortedNames = Object.keys(ranking).sort((a, b) => ranking[a].position - ranking[b].position)

  const detailedPositions = sortedNames.reduce((msg, name) => {
    const rnkngInfo = ranking[name]
    const positionChange = rnkngInfo.prevRelease?.position - rnkngInfo.position
    const positivePositionChangeText = positionChange > 0 ? `:arrow_up: ${positionChange}` : ''
    const negativePositionChangeText = positionChange < 0 ? `:small_red_triangle_down: ${positionChange * -1}` : ''
    const positionChangeText = positivePositionChangeText || negativePositionChangeText
    const pointsChange = rnkngInfo.points - rnkngInfo.prevRelease?.points
    const pointsChangeText = pointsChange ? (pointsChange > 0 ? `(+${pointsChange})` : `(${pointsChange})`) : ''
    return `${msg} ${rnkngInfo.position}º ${namesDictionary[name]}: ${rnkngInfo.points}${pointsChangeText} ${positionChangeText} \n`
  }, '')

  const dateLabel = dayjs().tz(timezoneBR).format('D, MMMM, YYYY')
  
  const message = `:wave: Atualização Ranking do IEE :statue_of_liberty: \n\n :spiral_calendar_pad: ${dateLabel} \n\n ${detailedPositions}`
  
  return message
}

async function notify(ranking) {
  if (!namesDictionary) {
    const namesSnap = await database.ref('names').once('value')
    namesDictionary = namesSnap.val()
  }

  const message = formatMessage(ranking)

  await Promise.all([
    axios.post(SLACK_WEBHOOK, { text: message }),
    axios.post(BISPER_WEBHOOK, { text: message })
  ])

  setTimeout(async () => {
    await axios.post(BISPER_WEBHOOK, { text: '🔗 Acesse o ranking completo \n https://rankiee.com?code=rothbard' })
  }, 60000)
}

async function notifyReaction(reaction) {
  if (!namesDictionary) {
    const namesSnap = await database.ref('names').once('value')
    namesDictionary = namesSnap.val()
  }

  const associateName = namesDictionary[reaction.associateName] || reaction.associateName
  const emoji = reaction.emoji
  const createdBy = reaction.createdBy || 'Anônimo'
  const message = reaction.message ? `\n💬 "${reaction.message}"` : ''
  
  const reactionMessage = `${associateName} recebeu ${emoji} de ${createdBy}${message}\n`

  try {
    await axios.post(BISPER_WEBHOOK, { text: reactionMessage })
  } catch (error) {
    console.error('Erro ao enviar notificação de reação:', error)
  }
}

export { notify, notifyReaction }
