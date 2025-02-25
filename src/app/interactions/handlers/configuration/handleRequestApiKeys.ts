import { wsChain } from '@api/gqlClients';
import { insertCircleApiTokens } from '@api/insertCircleApiTokens';
import { ButtonStyle, ComponentButtonLink, ComponentContext, ComponentType } from 'slash-create';
import { DiscordService } from 'src/app/service/DiscordService';
import { extractCircleId } from 'src/app/utils/extractCircleId';
import { isMessage } from 'src/app/utils/isMessage';
import Log from 'src/app/utils/Log';
import { sleep } from 'src/app/utils/sleep';
import { disableAllParentComponents } from '../common';
import { errorMessageOptions } from '../common/errorMessageOptions';
import { handleSendAlerts } from './handleSendAlerts';

/**
 * Request API keys flow
 * @param ctx the context
 * @param discordService the discord service
 */
export async function handleRequestApiKeys(ctx: ComponentContext) {
	try {
		await disableAllParentComponents(ctx);
		
		const discordService = new DiscordService(ctx);
	
		const channel = await discordService.findTextChannelById(ctx.channelID);
		const circleId = extractCircleId(ctx.message.content);

		if (!channel || !circleId) {
			throw new Error('Missing channel or circle');
		}
	
		const { success, rowId } = await insertCircleApiTokens({ circleId, channelSnowflake: channel?.id });
		if (!success) {
			throw new Error('Something went wrong, please contact coordinape support');
		}
	
		const AUTHORIZE_LINK_CIRCLE_BUTTON: ComponentButtonLink = {
			type: ComponentType.BUTTON,
			label: 'Authorize',
			style: ButtonStyle.LINK,
			url: `https://app.coordinape.com/discord/link?id=${rowId}&circleId=${circleId}`,
		};
	
		const message = await ctx.send({
			content: 'Click on the button below to authorize',
			components: [
				{ type: ComponentType.ACTION_ROW, components: [AUTHORIZE_LINK_CIRCLE_BUTTON] },
			],
			ephemeral: true,
		});

		const onDiscordCircleApiToken = wsChain('subscription')({
			discord_circle_api_tokens: [
				{ where: { circle_id: { _eq: circleId } } },
				{ circle_id: true, token: true },
			],
		});

		onDiscordCircleApiToken.on(async ({ discord_circle_api_tokens }) => {
			const circleApiToken = discord_circle_api_tokens.find(({ circle_id }) => circle_id === circleId);

			if (circleApiToken && circleApiToken.token) {
				onDiscordCircleApiToken.ws.close();
				if (isMessage(message)) {
					message.edit({ components: [{ type: ComponentType.ACTION_ROW, components: [{ ...AUTHORIZE_LINK_CIRCLE_BUTTON, disabled: true }] }] });
				}
				await ctx.send({
					content: `<@${ctx.user.id}>, you've linked the circle successfully!`,
					ephemeral: true,
				});
	
				// Just to improve message flow
				await sleep(3000);
	
				// Next question
				return handleSendAlerts(ctx);
			}
		});
	} catch (error) {
		await ctx.send(errorMessageOptions({ handlerName: 'handleRequestApiKeys', error }));
		Log.error(error);
	}
	
}
