import dayjs from 'dayjs'
import { database } from './firebase.js'

async function getRecentReactions() {
  try {
    const tenHoursAgo = dayjs().subtract(10, 'hours').toISOString()
    
    const reactionsRef = database.ref('reactions')
    const snapshot = await reactionsRef.once('value')
    const reactionsData = snapshot.val() || {}
    
    const recentReactions = []
    
    Object.entries(reactionsData).forEach(([associateName, associateReactions]) => {
      if (!associateReactions) return
      
      Object.values(associateReactions).forEach(reaction => {
        if (reaction.createdAt && dayjs(reaction.createdAt).isAfter(tenHoursAgo)) {
          recentReactions.push({
            associateName,
            emoji: reaction.emoji,
            createdBy: reaction.createdBy || 'Anônimo',
            message: reaction.message,
            createdAt: reaction.createdAt
          })
        }
      })
    })

    return recentReactions
  } catch (error) {
    console.error('Erro ao buscar reações recentes:', error)
    return []
  }
}

export { getRecentReactions } 