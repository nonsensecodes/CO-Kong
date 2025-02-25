import { deleteDiscordRolesCircles } from '@api/deleteDiscordRolesCircles';
import { findDiscordEntitiesByCircleId } from '@api/findDiscordEntitiesByCircleId';
import { insertDiscordRolesCircles } from '@api/insertDiscordRolesCircles';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, PermissionFlagsBits, Role, TextChannel } from 'discord.js';
import { ComponentActionRow, ComponentContext, ComponentSelectMenu, ComponentSelectOption } from 'slash-create';
import { CustomId } from 'src/app/interactions/customId';
import { DiscordService } from 'src/app/service/DiscordService';
import Log from 'src/app/utils/Log';
import { disableAllParentComponents } from '../common';
import { errorMessageOptions } from '../common/errorMessageOptions';
import { handleFinalMessage } from './handleFinalMessage';

type CleanUpProps = {
	circleId: number;
	role?: Role;
	channel?: TextChannel;
};

async function cleanUp({ circleId, role, channel }: CleanUpProps): Promise<void> {
	await deleteDiscordRolesCircles({ circleId });
	
	await role?.delete('Failed to create a channel for this role');
	await channel?.delete('Failed to create a role for this channel');
}

const LINK_CIRCLE_BUTTON = new ButtonBuilder()
	.setCustomId(CustomId.LinkCircleButton)
	.setLabel('Link Circle')
	.setStyle(ButtonStyle.Primary);

const SKIP_LINK_CIRCLE_BUTTON = new ButtonBuilder()
	.setCustomId(CustomId.SkipLinkCircleButton)
	.setLabel('Skip Link Circle')
	.setStyle(ButtonStyle.Secondary);

const linkCircleRow = new ActionRowBuilder<ButtonBuilder>()
	.addComponents(LINK_CIRCLE_BUTTON)
	.addComponents(SKIP_LINK_CIRCLE_BUTTON);

/**
 * Create a new Channel and Role for each Circle in the Coordinape Category
 * @param ctx the component context
 */
export async function handleCreateNewEntities(ctx: ComponentContext) {
	try {
		await disableAllParentComponents(ctx);
	
		const discordService = new DiscordService(ctx);
	
		const actionRowComponents = ctx.message.components as ComponentActionRow[];
		const select = actionRowComponents[0].components[0] as ComponentSelectMenu;
		const circles = select.options?.filter(option => option.default) || [];
		const coordinapeCategory = await getCoordinapeCategory(discordService);
	
		const newEntitites: { channel: TextChannel; role: Role, circle: ComponentSelectOption }[] = [];

		const guild = await discordService.findGuild();

		for (const circle of circles) {
			const { channelId, roleId } = await findDiscordEntitiesByCircleId({ circleId: Number(circle.value) });
			
			if (channelId && roleId) {
				const channel = await discordService.findTextChannelById(channelId);
				const role = await discordService.findRole(roleId);

				await ctx.send({
					content: `You have already requested circle \`${circle.label}\` (Circle ID: ${circle.value}) to be linked. The channel ${channel} and role ${role} have already been created. Please go there to finish linking the circle. If you've deleted them by mistake please contact coordinape.`,
					ephemeral: true,
				});
				continue;
			}

			const channel = await discordService.createChannel({
				name: circle.label,
				parent: coordinapeCategory,
				permissionOverwrites: [
					{
						id: guild.roles.everyone,
						deny: [PermissionFlagsBits.ViewChannel],
					},
					{
						id: ctx.user.id,
						allow: [PermissionFlagsBits.ViewChannel],
					},
					{
						id: ctx.creator.client.user.id,
						allow: [PermissionFlagsBits.ViewChannel],
					},
				],
			});
			const role = await discordService.createRole({ name: `CO-${circle.label} Member` });
	
			if (!channel && !role) {
				await ctx.send({
					content: 'Failed to create both the channel and role. Please contact coordinape',
					ephemeral: true,
				});
				continue;
			}
	
			if (!channel) {
				await ctx.send({
					content: 'Failed to create a channel. Please contact coordinape',
					ephemeral: true,
				});
				await role?.delete('Failed to create a channel for this role');
				continue;
			}
			if (!role) {
				await ctx.send({
					content: 'Failed to create a role. Please contact coordinape',
					ephemeral: true,
				});
				await channel.delete('Failed to create a role for this channel');
				continue;
			}
	
			try {
				const { success, data: { circle_id, discord_role_id } } = await insertDiscordRolesCircles({
					circleId: Number(circle.value),
					channelId: channel?.id,
					roleId: role?.id,
				});
	
				if (!success || !circle_id || !discord_role_id) {
					throw new Error('Failed to insert discord roles circles');
				}
			} catch (error) {
				cleanUp({ circleId: Number(circle.value), role, channel });
				await ctx.send(errorMessageOptions({ handlerName: 'handleCreateNewEntities/loop', error }));
				Log.error(error);
				continue;
			}
	
			newEntitites.push({ channel, role, circle });
		}

		for (const { channel, role, circle } of newEntitites) {
			await channel.send({
				content: `<@${ctx.user.id}> to manage \`${circle.label}\` (Circle ID: ${circle.value}) in Discord I'll need to get the API Key for the circle. This will enable me to watch this circle so I can send alerts, to manage circle membership (with the role ${role}), and to let circle members interact with Coordinape from within Discord. With your permission I'll go get that now.`,
				components: [linkCircleRow],
				options: {
					ephemeral: true,
				},
			});
		}
		
		if (newEntitites.length === 1) {
			await ctx.send({
				content: `Channel ${newEntitites[0].channel} and role ${newEntitites[0].role} created for circle \`${newEntitites[0].circle.label}\` under the ${coordinapeCategory} category, please go there to manage circle permissions`,
				ephemeral: true,
			});
		}
		
		if (newEntitites.length > 1) {
			await ctx.send({
				content: `I have created the following channels (under the ${coordinapeCategory} category) and roles, please go to each channel to manage circle permissions:\n${newEntitites.map(({ channel, role, circle }) => `> Channel ${channel} and role ${role} for circle \`${circle.label}\``).join('\n')}`,
				ephemeral: true,
			});
		}
	
		await handleFinalMessage(ctx);
	} catch (error) {
		await ctx.send(errorMessageOptions({ handlerName: 'handleCreateNewEntities', error }));
		Log.error(error);
	}
}

async function getCoordinapeCategory(discordService: DiscordService): Promise<CategoryChannel | undefined> {
	try {
		let category = await discordService.findCategoryByName('Coordinape');
	
		if (!category) {
			category = await discordService.createCategory({ name: 'Coordinape', position: 0 });
		}
		
		if (!category) {
			throw new Error('Failed to create the Coordinape category');
		}
		
		return category;
	} catch (error) {
		Log.error(error);
	}
}
