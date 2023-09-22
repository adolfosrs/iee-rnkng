import axios from 'axios'
import dayjs from 'dayjs'

import { database } from './firebase.js'

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK

let namesDictionary

function formatMessage(ranking) {
  const sortedNames = Object.keys(ranking).sort((a, b) => ranking[a].position - ranking[b].position)

  const detailedPositions = sortedNames.reduce((msg, name) => {
    const rnkngInfo = ranking[name]
    const positionChange = rnkngInfo.prevRelease?.position - rnkngInfo.position
    const positivePositionChangeText = positionChange > 0 ? `:arrow_up: ${positionChange}` : ''
    const negativePositionChangeText = positionChange < 0 ? `:small_red_triangle_down: ${positionChange * -1}` : ''
    const positionChangeText = positivePositionChangeText || negativePositionChangeText
    const pointsChange = rnkngInfo.points - rnkngInfo.prevRelease?.points
    const pointsChangeText = (pointsChange && `(+${pointsChange})`) || ''
    return `${msg} ${rnkngInfo.position}º ${namesDictionary[name]}: ${rnkngInfo.points}${pointsChangeText} ${positionChangeText} \n`
  }, '')

  const dateLabel = dayjs().format('D, MMMM, YYYY')
  return `:wave: Atualização Ranking do IEE :statue_of_liberty: \n\n :spiral_calendar_pad: ${dateLabel} \n\n ${detailedPositions}`
}

async function notify(ranking) {
  if (!namesDictionary) {
    const namesSnap = await database.ref('names').once('value')
    namesDictionary = namesSnap.val()
  }

  axios.post(SLACK_WEBHOOK, { text: formatMessage(ranking) })
}

export { notify }
