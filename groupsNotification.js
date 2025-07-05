import axios from 'axios'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

const timezoneBR = 'America/Sao_Paulo'

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK
const BISPER_WEBHOOK = process.env.BISPER_WEBHOOK

const groupsNamesDictionary = {
    'Taxados Ingl�rios': 'Taxados Inglórios'
}

const BISPER_DEBOUNCE_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours
let lastBisperNotification = dayjs().subtract(3, 'hour')

function formatGroupsMessage(ranking) {
  const sortedGroups = Object.keys(ranking).sort((a, b) => ranking[a].position - ranking[b].position)

  const detailedPositions = sortedGroups.reduce((msg, groupName) => {
    const groupInfo = ranking[groupName]
    const positionChange = groupInfo.prevRelease?.position - groupInfo.position
    const positivePositionChangeText = positionChange > 0 ? `:arrow_up: ${positionChange}` : ''
    const negativePositionChangeText = positionChange < 0 ? `:small_red_triangle_down: ${positionChange * -1}` : ''
    const positionChangeText = positivePositionChangeText || negativePositionChangeText
    const pointsChange = groupInfo.points - groupInfo.prevRelease?.points
    const pointsChangeFormatted = pointsChange ? Number(pointsChange.toFixed(2)) : null
    const pointsChangeText = pointsChangeFormatted ? (pointsChangeFormatted > 0 ? `(+${pointsChangeFormatted})` : `(${pointsChangeFormatted})`) : ''
    return `${msg} ${groupInfo.position}º ${groupsNamesDictionary[groupName] || groupName}: ${groupInfo.points}${pointsChangeText} ${positionChangeText} \n`
  }, '')

  const dateLabel = dayjs().tz(timezoneBR).format('D, MMMM, YYYY')
  
  const message = `:wave: Ranking de Grupos do IEE :statue_of_liberty: \n\n :spiral_calendar_pad: ${dateLabel} \n\n ${detailedPositions}`
  
  return message
}

async function notifyGroups(ranking) {
  const message = formatGroupsMessage(ranking)

  console.log('notifyGroups', message)

  const now = dayjs()
  const shouldSendBisper = now.diff(lastBisperNotification, 'millisecond') >= BISPER_DEBOUNCE_INTERVAL

  console.log('lastGroupsBisperNotification', lastBisperNotification.format(), now.format())
  console.log('shouldSendGroupsBisper', shouldSendBisper)

  const promises = [axios.post(SLACK_WEBHOOK, { text: message })]
  
  if (shouldSendBisper) {
    promises.push(axios.post(BISPER_WEBHOOK, { text: message }))
    lastBisperNotification = now
  }

  await Promise.all(promises)
}

export { notifyGroups } 