import UserError from '../user_error'
import { skipMcPrefix } from '../utils'
import PrismarineItem from 'prismarine-item'

export const server = function (serv: Server, { version }: Options) {
  const mcData = serv.mcData
  const Item = PrismarineItem(version)
  serv.entityMaxId = 0
  serv.players = []
  serv.uuidToPlayer = {}
  serv.entities = {}

  serv.getPlayer = username => {
    const found = serv.players.filter(pl => pl.username === username)
    if (found.length > 0) { return found[0] }
    return null
  }

  serv.getPlayers = (selector, ctxPlayer) => {
    return serv.selectorString(selector, ctxPlayer?.position, ctxPlayer?.world, true, ctxPlayer?.id).filter(entity => entity.type === 'player') as Player[]
  }

  serv.commands.add({
    base: 'gamemode',
    aliases: ['/gm'],
    info: 'to change game mode',
    usage: '/gamemode <mode> [player]',
    op: true,
    parse (str, ctx) {
      const paramsSplit = str.split(' ')
      if (paramsSplit[0] === '') {
        return false
      }
      if (!paramsSplit[0].match(/^(survival|creative|adventure|spectator|[0-3])$/)) {
        throw new UserError(`The gamemode you have entered (${paramsSplit[0]}) is not valid, it must be survival, creative, adventure, spectator, or a number from 0-3`)
      }
      if (!paramsSplit[1]) {
        if (ctx.player) return paramsSplit[0].match(/^(survival|creative|adventure|spectator|[0-3])$/)
        else throw new UserError('Console cannot set gamemode itself')
      }

      return str.match(/^(survival|creative|adventure|spectator|[0-3])( @[arspe](?:\[([^\]]+)\])?| \w+)?$/) || false
      // return params || false
    },
    action (str, ctx) {
      const gamemodes = {
        survival: 0,
        creative: 1,
        adventure: 2,
        spectator: 3
      }
      const target = str[2]?.trim()
      const gamemodesReverse = Object.assign({}, ...Object.entries(gamemodes).map(([k, v]) => ({ [v]: k })))
      const gamemode = parseInt(str[1], 10) || gamemodes[str[1]]
      const mode = !isNaN(parseInt(str[1], 10)) ? gamemodesReverse[parseInt(str[1], 10)] : str[1]
      const plyrs = serv.getPlayers(target ?? '@s', ctx.player)
      if (ctx.player) {
        if (plyrs.length > 0) {
          plyrs.forEach(plyr => plyr.setGameMode(gamemode))
          if (plyrs.length === 1) {
            if (plyrs[0].username === ctx.player.username) {
              return `Set own game mode to ${mode} Mode`
            }
            return `Set ${target}'s game mode to ${mode} Mode`
          } else {
            return `Set ${plyrs.length} players' game mode to ${mode} Mode`
          }
        } else {
          throw new UserError(`Player '${target}' not found`)
        }
      } else {
        if (plyrs.length > 0) {
          plyrs.forEach(plyr => plyr.setGameMode(gamemode))
          if (plyrs.length === 1) {
            return `Set ${target}'s game mode to ${mode} Mode`
          } else {
            return `Set ${plyrs.length} players' game mode to ${mode} Mode`
          }
        } else {
          throw new UserError(`Player '${target}' not found`)
        }
      }
    }
  })

  serv.commands.add({
    base: 'difficulty',
    aliases: ['/diff'],
    info: 'Sets the difficulty level',
    usage: '/difficulty <difficulty>',
    op: true,
    parse (str) {
      if (!str.match(/^([0-3])$/)) { return false }
      return parseInt(str)
    },
    action (diff) {
      serv._writeAll('difficulty', { difficulty: diff, difficultyLocked: false })
      serv.difficulty = diff
    }
  })

  serv.commands.add({
    base: 'give',
    info: 'Gives an item to a player.',
    usage: '/give <player> <item> [count]',
    tab: ['player', 'item', 'number'],
    op: true,
    parse (_args, ctx) {
      const args = _args.split(' ')
      if (args[0] === '') return false
      const players = serv.getPlayers(args[0], ctx.player)
      if (players.length < 1) throw new UserError('Player not found')
      if (args[2] && !args[2].match(/\d/)) throw new UserError('Count must be numerical')
      return {
        players,
        item: skipMcPrefix(args[1]),
        count: args[2] ? +args[2] : 1
      }
    },
    action ({ players, item, count }) {
      const itemData = isNaN(+item) ? mcData.itemsByName[skipMcPrefix(item)] : mcData.items[+item]

      if (!itemData) throw new UserError(`Unknown item '${item}'`)
      const newItem = new Item(itemData.id, count)

      for (const player of players) {
        let slotToUpdateFound = false
        for (const slot of player.inventory.slots) {
          if (!slot) continue
          if (slot.type === newItem.type) {
            slot.count += count
            player.inventory.updateSlot(slot.slot, slot)
            slotToUpdateFound = true
            break
          }
        }

        if (!slotToUpdateFound) {
          player.inventory.updateSlot(player.inventory.firstEmptyInventorySlot()!, newItem)
        }
      }
    }
  })

  serv.commands.add({
    base: 'enchant',
    info: 'Enchants items held by targets with the specified enchantment and level',
    usage: '/enchant <targets> <enchantment> [level]',
    tab: ['selector', 'item_enchantment', 'number'],
    op: true,
    parse (_args, ctx) {
      const args = _args.split(' ')
      if (args[0] === '') return false
      const enchantment = mcData.enchantmentsByName[skipMcPrefix(args[1])]
      if (!enchantment) throw new UserError('No such enchantment')
      if (args[2] && (parseInt(args[2]) > enchantment.maxLevel || parseInt(args[2]) < 1)) throw new UserError(`Level ${args[2]} is not supported by that enchantment`)
      const players = serv.getPlayers(args[0], ctx.player)
      if (!players.length) throw new UserError('No players found')
      return {
        players,
        enchantment,
        level: args[2] ? parseInt(args[2]) : 1
      }
    },
    action ({ players, enchantment, level }) {
      players.forEach(player => {
        const heldItem = player.inventory.slots[36 + player.heldItemSlot]
        if (!heldItem) return
        if (heldItem.enchants?.some(e => e.name === enchantment.name || enchantment.exclude.includes(e.name))) return
        heldItem.enchants = [...heldItem.enchants ?? [], { name: enchantment.name, lvl: level }]
        player.inventory.updateSlot(heldItem.slot, heldItem)
      })
    }
  })

  const resolveItem = (item) => {
    const itemR = isNaN(+item) ? serv.mcData.itemsByName[item]?.id : serv.mcData.itemsByName[item]?.id // todo blocks?;
    if (!itemR) throw new UserError(`Couldn't find the item ${item}`)
    return itemR
  }

  serv.commands.add({
    base: 'clear',
    info: '',
    usage: '/clear',
    parse(string, ctx) {
      let players = [] as Player[]
      const [playersArg, item, count] = string.split(' ')
      if (playersArg) {
        players = serv.getPlayers(playersArg, ctx.player)
      } else if (ctx.player) {
        players = [ctx.player]
      }
      if (players.length < 1) throw new UserError('Player not found')
      if (count && !count.match(/\d+/)) throw new UserError('Count must be numerical')
      return {
        players,
        item: item && resolveItem(item),
        count: count ?? 1
      }
    },
    action(data, ctx) {
      let removed = 0
      for (const player of data.players) {
        for (const [i, slot] of player.inventory.slots.entries()) {
          if (!slot || (data.item && slot.type !== data.item)) continue
          // todo impl to remove count
          player.inventory.updateSlot(i, null as any)
        }
      }
    },
  })

  serv.commands.add({
    base: 'tell',
    info: 'Whispers a message to a player.',
    usage: '/tell <player> <message>',
    tab: ['player', 'text'],
    parse(str, ctx) {
      // todo change validation
      return str.match(/^([\w\d]+) (.+)$/) || false
    },
    action([target, message], ctx) {
      const players = serv.getPlayers(target, ctx.player)
      if (players.length < 1) throw new UserError('Player not found')
      players.forEach(player => player.chat(`from ${ctx.player?.username ?? 'server'}: ${message}`))
    }
  })

  // serv.commands.add({
  //   base: 'title',
  //   info: 'Shows a title to a player.',
  //   usage: '/title <player> <title> [subtitle]',
  //   tab: ['player', 'text', 'text'],
  //   parse(str, ctx) {
  //     // todo change validation
  //     return str.match(/^([\w\d]+) (.+)$/) || false
  //   },
  //   action([target, title, subtitle], ctx) {
  //     const players = serv.getPlayers(target, ctx.player)
  //     if (players.length < 1) throw new UserError('Player not found')
  //     players.forEach(player => player.showTitle(title, subtitle))
  //   }
  // })
}
declare global {
  interface Server {
    /** The current maximum ID (i.e. the last entity that was spawned has that id) */
    "entityMaxId": number
    /** An array of players currently logged in */
    "players": Player[]
    /** Object for converting UUIDs to players */
    "uuidToPlayer": {}
    /** All of the entities */
    "entities": Record<string, Entity>
    /** Returns player object with that username or, if no such player is on the server, null. */
    "getPlayer": (username: any) => any
    /** @internal */
    "getPlayers": (selector: any, ctxPlayer: any) => Player[]
  }
}
