import { gqlBot } from '@api/gqlClients';
import { ComponentContext } from 'slash-create';
import Log from 'src/app/utils/Log';
import { disableAllParentComponents } from '../common';
import { errorMessageOptions } from '../common/errorMessageOptions';

export async function handleUnlinkButton(ctx: ComponentContext): Promise<void> {
	try {
		await disableAllParentComponents(ctx);
	
		const { delete_discord_users } = await gqlBot('mutation')({
			delete_discord_users: [
				{ where: { user_snowflake: { _eq: ctx.user.id } } },
				{ affected_rows: true },
			],
		});
					
		if (delete_discord_users && delete_discord_users.affected_rows === 1) {
			await ctx.send({
				content: 'I\'ve removed the link between Coordinape and Discord. I\'ll no longer be able to specifically notify you for any Coordinape events. You can still use the `/coordinape config` Command in Discord severs where I\'m enabled!',
				ephemeral: true,
			});
			return;
		}
		await ctx.send({
			content: 'Failed to unlink. Please run the command again',
			ephemeral: true,
		});
	} catch (error) {
		await ctx.send(errorMessageOptions({ handlerName: 'handleUnlinkButton', error }));
		Log.error(error);
	}
}
