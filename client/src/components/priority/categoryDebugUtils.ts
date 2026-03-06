import { CategoryDebugData } from './CategoryDebugModal.types';

// Pure section builders for GitHub issue formatting.

function appendEmailSection(lines: string[], email: CategoryDebugData['email']): void {
  const fromDisplay = email.fromName ? `${email.fromName} <${email.from}>` : email.from;
  lines.push('### Email', `- **From**: ${fromDisplay}`);
  if (email.senderJobTitle) { lines.push(`- **Job Title**: ${email.senderJobTitle}`); }
  lines.push(`- **Subject**: ${email.subject}`);
  if (email.bodyPreview) { lines.push('- **Body Preview**:', '  ```', `  ${email.bodyPreview.replace(/\n/g, '\n  ')}`, '  ```'); }
  lines.push('');
}

function appendCategorySection(lines: string[], thread: CategoryDebugData['thread']): void {
  lines.push('### Current Category', `- **Category**: ${thread.category ?? 'None'}`);
  if (thread.categoryExplanation) { lines.push(`- **Explanation**: ${thread.categoryExplanation}`); }
  lines.push('');
}

function appendCategoriesList(lines: string[], categories: CategoryDebugData['emailCategories'], header: string): void {
  lines.push(header);
  if (categories.length === 0) { lines.push('None'); }
  else { categories.forEach(cat => lines.push(`- **${cat.name}**${cat.description ? `: ${cat.description}` : ''}`)); }
  lines.push('');
}

function appendContextItemList(lines: string[], label: string, items: Array<{value: string; explanation?: string; priority?: number}>): void {
  if (items.length === 0) return;
  lines.push(`**${label}:**`);
  items.forEach(item => {
    let extra = '';
    if (item.explanation) {
      extra = ` (${item.explanation})`;
    } else if (item.priority !== undefined) {
      extra = ` (priority ${item.priority})`;
    }
    lines.push(`- ${item.value}${extra}`);
  });
}

export const formatForGithubIssue = (debugInfo: CategoryDebugData): string => {
  const lines: string[] = ['## Category Debug Report', ''];
  appendEmailSection(lines, debugInfo.email);
  appendCategorySection(lines, debugInfo.thread);
  appendCategoriesList(lines, debugInfo.emailCategories, `### Available Categories (${debugInfo.emailCategories.length})`);
  if (debugInfo.protoCategories.length > 0) {
    appendCategoriesList(lines, debugInfo.protoCategories, `### Proto Categories (${debugInfo.protoCategories.length})`);
  }
  lines.push('### User Context');
  const { urgentItems, notUrgentItems, goals, workingOn, dontCare } = debugInfo.userContext;
  appendContextItemList(lines, 'Urgent Items', urgentItems);
  appendContextItemList(lines, 'Not Urgent Items', notUrgentItems);
  appendContextItemList(lines, 'Goals', goals);
  appendContextItemList(lines, 'Working On', workingOn);
  appendContextItemList(lines, "Don't Care", dontCare);
  if (!urgentItems.length && !notUrgentItems.length && !goals.length && !workingOn.length && !dontCare.length) {
    lines.push('None');
  }
  return lines.join('\n');
};
