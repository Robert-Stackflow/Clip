/** Select a real visible segment or use the same overflow popup as the user. */
async function chooseReferenceTab(page,id){
 await page.waitForSelector('.reference-tabs[data-adaptive-ready="true"]');
 const button=page.locator(`.reference-tabs>[data-tab="${id}"]`);
 if(await button.isVisible())return button.click();
 const index=await page.locator('#reference-overflow option').evaluateAll((options,id)=>options.findIndex(option=>option.value===id),id);
 if(index<0)throw new Error('Reference tab missing from overflow: '+id);
 await page.locator('#reference-overflow-trigger').click();
 await page.locator('.select-popup [role=option]').nth(index).click();
}
module.exports={chooseReferenceTab};
