import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import axios from 'axios'
import * as cheerio from 'cheerio'

dayjs.extend(utc)
dayjs.extend(timezone)

import { database } from './firebase.js'
import { notifyGroups } from './groupsNotification.js'

const timezoneBR = 'America/Sao_Paulo'
const GROUPS_RANKING_URL = 'https://portaldoassociado-iee.com.br/s-info/rl_rankinggrupohome.php?associado_id=500&gestao_id=41'

async function scrapeGroupsRanking() {
  try {
    console.log('Scraping groups ranking from:', GROUPS_RANKING_URL)
    const response = await axios.get(GROUPS_RANKING_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    const $ = cheerio.load(response.data)
    const groups = []

    // Parse the table rows
    $('table tbody tr').each((index, element) => {
      const $row = $(element)
      const $cells = $row.find('td')
      
      // Skip rows that don't have 3 cells (position, group name, points)
      if ($cells.length !== 3) return
      
      const positionText = $cells.eq(0).text().trim()
      const groupName = $cells.eq(1).text().trim()
      const pointsText = $cells.eq(2).text().trim()
      
      // Skip if any field is empty or if it's not a valid position
      if (!positionText || !groupName || !pointsText) return
      
      // Extract position number (remove º character)
      const position = parseInt(positionText.replace('º', '').replace('°', ''))
      if (isNaN(position)) return
      
      // Convert points from Brazilian format (1.088,40) to number
      const points = parseFloat(pointsText.replace('.', '').replace(',', '.'))
      if (isNaN(points)) return
      
      groups.push({
        position,
        name: groupName,
        points
      })
    })

    console.log('Scraped groups:', groups)
    return groups
  } catch (error) {
    console.error('Error scraping groups ranking:', error)
    return null
  }
}

async function getLastGroupsRelease() {
  const yesterdayYMD = dayjs().tz(timezoneBR).subtract(1, 'days').format('YYYYMMDD')
  console.log('yesterdayYMD for groups:', yesterdayYMD)
  const snap = await database.ref('groups-releases').orderByKey().endAt(yesterdayYMD).limitToLast(1).once('value')
  console.log('groups snap.val()', snap.val())
  const lastRelease = Object.values(snap.val() || {})?.[0]

  return lastRelease?.ranking
}

async function getGroupsReleaseByYMD(ymd) {
  const snap = await database.ref(`groups-releases/${ymd}`).once('value')
  return snap.val()
}

function checkHasGroupsRankingDiff(lastReleaseRanking, currentRanking) {
  if (!lastReleaseRanking) return true
  
  const hasDiff = Object.keys(currentRanking).some(groupName => {
    return currentRanking[groupName].points !== lastReleaseRanking[groupName]?.points
  })
  return hasDiff
}

function convertGroupsToRankingObject(groups) {
  const ranking = {}
  groups.forEach(group => {
    ranking[group.name] = {
      position: group.position,
      points: group.points
    }
  })
  return ranking
}

async function updateGroupsRanking() {
  console.log('Updating groups ranking...')
  const groups = await scrapeGroupsRanking()
  
  if (!groups || groups.length === 0) {
    console.log('No groups data found or scraping failed')
    return
  }

  const currentRanking = convertGroupsToRankingObject(groups)
  console.log('syncGroupsRanking:', currentRanking)

  await database.ref('hot-groups-rnkng').set(currentRanking)
}

function startGroupsObserver() {
  console.log('Starting groups observer...')
  
  database.ref('hot-groups-rnkng').on('value', async snap => {
    console.log('Groups Observer Triggered')
    const pointsByGroups = snap.val()

    if (pointsByGroups) {
      const lastReleaseRanking = await getLastGroupsRelease()
      console.log('lastGroupsReleaseRanking', lastReleaseRanking)

      const releaseRanking = Object.keys(pointsByGroups).reduce((obj, groupName) => {
        obj[groupName] = {
          ...pointsByGroups[groupName],
          prevRelease: {
            points: lastReleaseRanking?.[groupName]?.points || null,
            position: lastReleaseRanking?.[groupName]?.position || null
          }
        }
        return obj
      }, {})

      const todayYMD = dayjs().tz(timezoneBR).format('YYYYMMDD')
      const todayRelease = await getGroupsReleaseByYMD(todayYMD)

      const latestReleaseRanking = todayRelease?.ranking || lastReleaseRanking
      if (true || !latestReleaseRanking || checkHasGroupsRankingDiff(latestReleaseRanking, releaseRanking)) {
        console.log('!!!NEW GROUPS RELEASE!!!')
        await database.ref(`groups-releases/${todayYMD}`).set({
          updatedAt: dayjs().toISOString(),
          ranking: releaseRanking
        })

        await notifyGroups(releaseRanking)
      }
    }
  })
}

export { startGroupsObserver, updateGroupsRanking } 