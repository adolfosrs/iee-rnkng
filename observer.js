import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

import { database } from './firebase.js'
import { notify, notifyReaction } from './notification.js'

const timezoneBR = 'America/Sao_Paulo'

async function getLastReleaseRanking() {
  const yesterdayYMD = dayjs().tz(timezoneBR).subtract(1, 'days').format('YYYYMMDD')
  const snap = await database.ref('releases').orderByKey().endAt(yesterdayYMD).limitToLast(1).once('value')
  const lastRelease = Object.values(snap.val() || {})?.[0]

  return lastRelease?.ranking
}

async function getReleaseByYMD(ymd) {
  const snap = await database.ref(`releases/${ymd}`).once('value')
  return snap.val()
}

//observer will always trigger callback on first sync. so in case server restarts we should check it so we dont release on such scenario
function checkHasRankingDiff(lastReleaseRanking, currentRanking) {
  const hasDiff = Object.keys(currentRanking).some(associate => {
    return currentRanking[associate].points !== lastReleaseRanking[associate].points
  })
  return hasDiff
}

function startObserver() {
  database.ref('hot-rnkng').on('value', async snap => {
    console.log('Observer Triggered')
    const pointsByAssociates = snap.val()

    if (pointsByAssociates) {
      const lastReleaseRanking = await getLastReleaseRanking()
      console.log('lastReleaseRanking', lastReleaseRanking)

      const releaseRanking = Object.keys(pointsByAssociates).reduce((obj, associate) => {
        obj[associate] = {
          ...pointsByAssociates[associate],
          prevRelease: {
            points: lastReleaseRanking?.[associate]?.points || null,
            position: lastReleaseRanking?.[associate]?.position || null
          }
        }
        return obj
      }, {})

      const todayYMD = dayjs().tz(timezoneBR).format('YYYYMMDD')
      const todayRelease = await getReleaseByYMD(todayYMD)

      const latestReelaseRanking = todayRelease?.ranking || lastReleaseRanking?.ranking
      if (true || !latestReelaseRanking || checkHasRankingDiff(latestReelaseRanking, releaseRanking)) {
        console.log('!!!NEW RELEASE!!!')
        database.ref(`releases/${todayYMD}`).set({
          updatedAt: dayjs().toISOString(),
          ranking: releaseRanking
        })

        notify(releaseRanking)
      }
    }
  })
}

function startReactionsObserver() {
  console.log('Starting reactions observer...')
  
  const observersStartedAt = dayjs().utc().format()
  const observedAssociates = new Set()
  
  database.ref('reactions').on('child_added', async (snap) => {
    console.log('New associate reactions detected:', snap.key)
    if (!observedAssociates.has(snap.key)) {
      observedAssociates.add(snap.key)
      setupAssociateReactionsObserver(snap.key, observersStartedAt)
    }
  })
  
  database.ref('reactions').once('value', (snap) => {
    const associates = snap.val() || {}
    Object.keys(associates).forEach(associateKey => {
      if (!observedAssociates.has(associateKey)) {
        observedAssociates.add(associateKey)
        setupAssociateReactionsObserver(associateKey, observersStartedAt)
      }
    })
  })
}

function setupAssociateReactionsObserver(associateKey, observersStartedAt) {  
  database.ref(`reactions/${associateKey}`).on('child_added', async (snap) => {
    console.log('observersStartedAt', observersStartedAt)
    const reaction = snap.val()
    if (reaction && dayjs(reaction.createdAt).utc().isAfter(dayjs(observersStartedAt).utc())) {
      const reactionData = {
        associateName: associateKey,
        emoji: reaction.emoji,
        createdBy: reaction.createdBy || 'Anônimo',
        message: reaction.message,
        createdAt: reaction.createdAt
      }
      
      console.log('Nova reação detectada:', reactionData)
      await notifyReaction(reactionData)
    }
  })
}

export { startObserver, startReactionsObserver }
