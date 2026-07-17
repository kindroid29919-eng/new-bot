/**
 * role.js — x!role
 * Multi-purpose role management command.
 * Requires: Manage Roles permission for both the bot and the command user
 * (except `x!role commands`, which just prints help).
 *
 * Subcommands:
 *   x!role add <@user> <role name/id>       — give a member a role
 *   x!role remove <@user> <role name/id>    — take a role away from a member
 *   x!role create <name> [hexColor]         — create a new role
 *   x!role delete <role name/id>            — delete a role entirely
 *   x!role all <role name/id>               — add a role to every member
 *   x!role removeall <role name/id>         — remove a role from every member
 *   x!role bots <role name/id>              — add a role to every bot
 *   x!role commands                         — show this list
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  const sub = (args[0] || '').toLowerCase();

  if (!sub || sub === 'commands' || sub === 'help') {
    return message.reply({ embeds: [helpEmbed()] });
  }

  // Every other subcommand needs Manage Roles.
  if (!message.member.permissions.has('ManageRoles')) {
    return message.reply({ embeds: [noPermEmbed('You need the **Manage Roles** permission to use this.')] });
  }
  if (!message.guild.members.me.permissions.has('ManageRoles')) {
    return message.reply({ embeds: [noPermEmbed('I need the **Manage Roles** permission to do that.')] });
  }

  const rest = args.slice(1);

  switch (sub) {
    case 'add':
      return handleAdd(message, rest);
    case 'remove':
      return handleRemove(message, rest);
    case 'create':
      return handleCreate(message, rest);
    case 'delete':
      return handleDelete(message, rest);
    case 'all':
      return handleBulk(message, rest, 'all');
    case 'removeall':
    case 'remove-all':
      return handleBulk(message, rest, 'removeall');
    case 'bots':
      return handleBulk(message, rest, 'bots');
    default:
      return message.reply({ embeds: [helpEmbed(`Unknown subcommand \`${sub}\`.`)] });
  }
}

// ── add ────────────────────────────────────────────────────────────────────────
async function handleAdd(message, args) {
  const target = message.mentions.members.first();
  if (!target) {
    return message.reply({ embeds: [usageEmbed('x!role add <@user> <role name/id>', 'x!role add @Ahad Moderator')] });
  }

  const roleQuery = args.slice(1).join(' ');
  const role = resolveRole(message.guild, roleQuery);
  if (!role) {
    return message.reply({ embeds: [errorEmbed(`Couldn't find a role matching \`${roleQuery}\`.`)] });
  }

  const check = checkRoleHierarchy(message, role);
  if (check) return message.reply({ embeds: [errorEmbed(check)] });

  if (target.roles.cache.has(role.id)) {
    return message.reply({ embeds: [errorEmbed(`${target.user.tag} already has **${role.name}**.`)] });
  }

  try {
    await target.roles.add(role, `${message.author.tag}: x!role add`);
    return message.reply({ embeds: [successEmbed(`Added **${role.name}** to ${target.user.tag}.`)] });
  } catch (err) {
    console.error('[role add]', err);
    return message.reply({ embeds: [errorEmbed('Failed to add that role.')] });
  }
}

// ── remove ─────────────────────────────────────────────────────────────────────
async function handleRemove(message, args) {
  const target = message.mentions.members.first();
  if (!target) {
    return message.reply({ embeds: [usageEmbed('x!role remove <@user> <role name/id>', 'x!role remove @Ahad Moderator')] });
  }

  const roleQuery = args.slice(1).join(' ');
  const role = resolveRole(message.guild, roleQuery);
  if (!role) {
    return message.reply({ embeds: [errorEmbed(`Couldn't find a role matching \`${roleQuery}\`.`)] });
  }

  const check = checkRoleHierarchy(message, role);
  if (check) return message.reply({ embeds: [errorEmbed(check)] });

  if (!target.roles.cache.has(role.id)) {
    return message.reply({ embeds: [errorEmbed(`${target.user.tag} doesn't have **${role.name}**.`)] });
  }

  try {
    await target.roles.remove(role, `${message.author.tag}: x!role remove`);
    return message.reply({ embeds: [successEmbed(`Removed **${role.name}** from ${target.user.tag}.`)] });
  } catch (err) {
    console.error('[role remove]', err);
    return message.reply({ embeds: [errorEmbed('Failed to remove that role.')] });
  }
}

// ── create ─────────────────────────────────────────────────────────────────────
async function handleCreate(message, args) {
  if (!args.length) {
    return message.reply({ embeds: [usageEmbed('x!role create <name> [hexColor]', 'x!role create Events #5865f2')] });
  }

  // Last token is treated as a hex color if it looks like one.
  let color = null;
  let nameParts = [...args];
  const lastToken = args[args.length - 1];
  if (/^#?[0-9a-f]{6}$/i.test(lastToken)) {
    color = lastToken.startsWith('#') ? lastToken : `#${lastToken}`;
    nameParts = args.slice(0, -1);
  }

  const name = nameParts.join(' ').trim();
  if (!name) {
    return message.reply({ embeds: [errorEmbed('Please provide a role name.')] });
  }

  try {
    const role = await message.guild.roles.create({
      name,
      color: color ?? undefined,
      reason: `${message.author.tag}: x!role create`,
    });
    return message.reply({ embeds: [successEmbed(`Created role **${role.name}** (${role})`)] });
  } catch (err) {
    console.error('[role create]', err);
    return message.reply({ embeds: [errorEmbed('Failed to create that role.')] });
  }
}

// ── delete ─────────────────────────────────────────────────────────────────────
async function handleDelete(message, args) {
  const roleQuery = args.join(' ');
  if (!roleQuery) {
    return message.reply({ embeds: [usageEmbed('x!role delete <role name/id>', 'x!role delete Events')] });
  }

  const role = resolveRole(message.guild, roleQuery);
  if (!role) {
    return message.reply({ embeds: [errorEmbed(`Couldn't find a role matching \`${roleQuery}\`.`)] });
  }

  const check = checkRoleHierarchy(message, role);
  if (check) return message.reply({ embeds: [errorEmbed(check)] });

  try {
    const name = role.name;
    await role.delete(`${message.author.tag}: x!role delete`);
    return message.reply({ embeds: [successEmbed(`Deleted role **${name}**.`)] });
  } catch (err) {
    console.error('[role delete]', err);
    return message.reply({ embeds: [errorEmbed('Failed to delete that role.')] });
  }
}

// ── all / removeall / bots ─────────────────────────────────────────────────────
async function handleBulk(message, args, mode) {
  const roleQuery = args.join(' ');
  if (!roleQuery) {
    const examples = {
      all: 'x!role all Member',
      removeall: 'x!role removeall Member',
      bots: 'x!role bots Bot',
    };
    return message.reply({ embeds: [usageEmbed(`x!role ${mode} <role name/id>`, examples[mode])] });
  }

  const role = resolveRole(message.guild, roleQuery);
  if (!role) {
    return message.reply({ embeds: [errorEmbed(`Couldn't find a role matching \`${roleQuery}\`.`)] });
  }

  const check = checkRoleHierarchy(message, role);
  if (check) return message.reply({ embeds: [errorEmbed(check)] });

  await message.guild.members.fetch();
  let targets = message.guild.members.cache.filter((m) => !m.user.bot || mode === 'bots');
  if (mode === 'bots') targets = targets.filter((m) => m.user.bot);
  if (mode === 'all') targets = targets.filter((m) => !m.roles.cache.has(role.id));
  if (mode === 'removeall') targets = targets.filter((m) => m.roles.cache.has(role.id));

  if (!targets.size) {
    return message.reply({ embeds: [errorEmbed('No matching members to update — nothing to do.')] });
  }

  const progressEmbed = new EmbedBuilder()
    .setColor(0xffd32a)
    .setTitle('⏳  Updating Roles…')
    .setDescription(`Applying **${role.name}** to **${targets.size}** member(s). This may take a while for large servers.`)
    .setTimestamp();
  const progressMsg = await message.reply({ embeds: [progressEmbed] });

  let success = 0;
  let failed = 0;

  for (const member of targets.values()) {
    try {
      if (mode === 'removeall') {
        await member.roles.remove(role, `${message.author.tag}: x!role removeall`);
      } else {
        await member.roles.add(role, `${message.author.tag}: x!role ${mode}`);
      }
      success++;
    } catch (err) {
      failed++;
    }
  }

  const verb = mode === 'removeall' ? 'Removed from' : 'Added to';
  const doneEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('✅  Bulk Role Update Complete')
    .setDescription(
      `**${verb}** ${success} member(s) with **${role.name}**.` +
      (failed ? `\n⚠️ Failed for ${failed} member(s) (likely role hierarchy issues).` : ''),
    )
    .setTimestamp();

  await progressMsg.edit({ embeds: [doneEmbed] });
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolves a role by mention, ID, or case-insensitive name. */
function resolveRole(guild, query) {
  if (!query) return null;
  const mentionMatch = query.match(/^<@&(\d+)>$/);
  const id = mentionMatch ? mentionMatch[1] : query;

  return (
    guild.roles.cache.get(id) ||
    guild.roles.cache.find((r) => r.name.toLowerCase() === query.toLowerCase())
  );
}

/** Returns an error string if the role can't safely be touched, otherwise null. */
function checkRoleHierarchy(message, role) {
  if (role.id === message.guild.id) {
    return 'The @everyone role cannot be managed with this command.';
  }
  if (role.managed) {
    return 'That role is managed by an integration (e.g. a bot) and can\'t be modified manually.';
  }
  const botHighest = message.guild.members.me.roles.highest;
  if (role.position >= botHighest.position) {
    return `I can't manage **${role.name}** — it's higher than or equal to my highest role.`;
  }
  const authorHighest = message.member.roles.highest;
  if (!message.member.permissions.has('Administrator') && role.position >= authorHighest.position) {
    return `You can't manage **${role.name}** — it's higher than or equal to your highest role.`;
  }
  return null;
}

function noPermEmbed(desc) {
  return new EmbedBuilder().setColor(0xff6b81).setTitle('🚫  No Permission').setDescription(desc).setTimestamp();
}

function errorEmbed(desc) {
  return new EmbedBuilder().setColor(0xff4757).setTitle('❌  Error').setDescription(desc).setTimestamp();
}

function successEmbed(desc) {
  return new EmbedBuilder().setColor(0x2ecc71).setTitle('✅  Done').setDescription(desc).setTimestamp();
}

function usageEmbed(usage, example) {
  return new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle('❌  Invalid Usage')
    .setDescription(`**Usage:** \`${usage}\`\n**Example:** \`${example}\``)
    .setTimestamp();
}

function helpEmbed(note) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎭  Role Command')
    .setDescription(
      (note ? `${note}\n\n` : '') +
      [
        '`x!role add <@user> <role>` — give a member a role',
        '`x!role remove <@user> <role>` — take a role from a member',
        '`x!role create <name> [hexColor]` — create a new role',
        '`x!role delete <role>` — delete a role',
        '`x!role all <role>` — add a role to every member',
        '`x!role removeall <role>` — remove a role from every member',
        '`x!role bots <role>` — add a role to every bot',
        '`x!role commands` — show this list',
      ].join('\n'),
    )
    .setTimestamp();
  return embed;
}

module.exports = { execute };
