import { ButtonStyle, ComponentButton, ComponentContext, ComponentSelectMenu, ComponentSelectOption, ComponentType } from 'slash-create';
import _ from 'lodash';
import { Circle, getCircles } from '@api/getCircles';
import { getLinkedCircles } from '@api/getLinkedCircles';
import { CustomId } from 'src/app/interactions/customId';
import { disableAllParentComponents } from '../common';
import { CIRCLE_SELECT_NEXT_BUTTON, CIRCLE_SELECT_SKIP_BUTTON } from './handleCircleSelect';
import { HELP_BUTTON } from 'src/app/common';
import Log from 'src/app/utils/Log';
import { errorMessageOptions } from '../common/errorMessageOptions';

export const ALL_CIRCLES_LINKED_CONTINUE_BUTTON: ComponentButton = {
	type: ComponentType.BUTTON,
	style: ButtonStyle.SUCCESS,
	label: 'Setup Alerts',
	custom_id: CustomId.AllowAlertsButton,
};

export const ALL_CIRCLES_LINKED_SKIP_BUTTON: ComponentButton = {
	type: ComponentType.BUTTON,
	style: ButtonStyle.DESTRUCTIVE,
	label: 'Skip',
	custom_id: CustomId.Skip,
};

export const buildCircleSelect = ({ circles, options }: {circles?: Circle[]; options?: ComponentSelectOption[]}): ComponentSelectMenu => ({
	type: ComponentType.STRING_SELECT,
	options: circles ? circles.map(({ name, id }) => ({ value: id.toString(), label: name })) : options,
	placeholder: 'Please select the circles here',
	custom_id: CustomId.CircleSelect,
	min_values: 0,
	max_values: circles ? circles.length : options?.length,
});

/**
 * Link circles
 * @param ctx the context
 */
export async function handleLinkCircles(ctx: ComponentContext): Promise<void> {
	try {
		await disableAllParentComponents(ctx);
	
		const circles = await getCircles({ userId: ctx.user.id });
		const linkedCircles = await getLinkedCircles();
	
		const unlinkedCircles = circles.reduce((prev, curr) => {
			if (linkedCircles.includes(curr.id)) {
				return prev;
			}
			return [...prev, curr];
		}, [] as Circle[]);
	
		if (unlinkedCircles.length === 0) {
			await ctx.send({
				content: 'All your circles are already linked!',
				ephemeral: true,
			});
			return;
		}
	
		await ctx.send({
			content: `I see you have ${getLinkedCirclesText(unlinkedCircles)}.\n\nI'll need to create a new channel and role in this server to link these Circles following this schema:\n\n> Channel = \`#circle-name\`\n> Role = \`@Circle Name Member\`\n\nFor example, for your circle "${unlinkedCircles[0].name}" I will create the channel \`#${_.kebabCase(unlinkedCircles[0].name)}\` and the role \`@${unlinkedCircles[0].name} Member\`\n\nPlease select the Circles that you want me to manage from the **dropdown list** and click Next`,
			components: [
				{ type: ComponentType.ACTION_ROW, components: [buildCircleSelect({ circles: unlinkedCircles })] },
				{ type: ComponentType.ACTION_ROW, components: [ { ...CIRCLE_SELECT_NEXT_BUTTON, disabled: true }, CIRCLE_SELECT_SKIP_BUTTON, HELP_BUTTON ] },
			],
			ephemeral: true,
		});
	} catch (error) {
		await ctx.send(errorMessageOptions({ handlerName: 'handleLinkCircles', error }));
		Log.error(error);
	}
}

function getLinkedCirclesText(circles: Circle[]) {
	if (circles.length === 1) {
		return '1 Circle that isn\'t yet linked to Discord';
	}
	return `${circles.length} Circles that aren't yet linked to Discord`;
}
