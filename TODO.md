# Todo



## Clean up

- [ ] Test out recurring bank rule (and move them to another screen?)
- [ ] Allow parent to have chores, sets, tickets, rewards, and activity to show (if on, when a parent goes to their pages it should select them by default) - also rename "Kid Pages" to "Family Pages" (if any parent's are shown on the dashboard).
- [ ] When adding a parent, have Show on dash and Show balance be toggled off by default.
- [ ] Kid log in should update panel item counters
- [ ] For the bank - consider a "blocks" or "cash" visual to encourage understanding of the money/numbers. The blocks for really young kids, the cash for older kids.
- [ ] Settings:
  - [ ] How many task sets can be checked out? (ideally only 4-8 at max, but that includes any projects assigned)
  - [ ] Change parent's email
  - [ ] Allow parent to "pin" recent bank and ticket transactions (so they stay all the time).

## Approvals

- [ ] Have a soft victory message, and then the next time the kid comes on they see a banner that would show the full victory message (once the parent approves). Also allow the parent to show the victory message to the kid on their device since the parent might be sitting there with the kid.
- [ ] Approval inbox -> group chores by day? So chores today/yesterday are more clear/obvious?
- [ ] Approval required -> for bank withdraw and transfers
- [ ] Approval per Set (maybe each badge/award needs to be approved)

## Learning money

The idea is to have coins and bills as objects on the screen that can be dragged around by touch/mouse.

- [x] Own stack -> Fullscreen mode that shows the coins & cash you have (ideally with a way for you to break or combine money)
- [ ] Exchange stack -> where you can break or convert stacks ($1x5 + $5 =$10) - once selected the new monies animate back into your stack.
- [ ] Transfer -> Your own stack and the stack of where you're sending it to
- [ ] Withdraw -> Your own stack and where stack for where spending it
- [ ] Receive -> Deposits to your account show all possible coins/bills you see the amount but you have to drag down the correct before you can receive it
- [ ] Should it show the total or just have you guess? I think for receive it should show the total but then you have to guess until you get it right (nothing that shows what you have on the stack, you just have to keep going until you get it right or else you don't get the money to spend).
- [ ] After you close your stack - if you sent/received then your account balance should animate quickly to the new number (and side panel should update, too)

## Task sets

- [ ] FInal:
  - [x] My Tasks -> how to layout? Groupping looks bad.
  - [x] Overview update (show trophies and sets)
  - [ ] Allow kids to "check-out" a task set (x at a time?)  -> request sent to parent's inbox
  - [ ] Manage Sets -> How to sort/find/filter when lists get long?
  - [ ] How to limit projects (8 seems like max to display - might need a +2 more symbol)
- [ ] Check: did project and completed awards get reset (remove from "My sets" the next day?)



## Advanced

- [ ] Inbox -> for confirming task check off for kids that require oversight, for accepting Sets that a kid wants to work on, etc.
- [ ] How do we handle levels of badgets/awards and how do we handle optional steps for badges?
- [ ] Trophies:
  - [ ] Streaks -> check offs, no spending, etc?
  - [ ] Challenges (ranks) -> X days of all chores done, X amount of projects earned, X amont of awards earned, X amount of money in checking/savings/etc.
- [ ] TRMNL view
- [ ] PWA? (sounds easy, just need some icons)
- [ ] Log in with Apple account? (requires Apple dev fee)
- [ ] Curiosity Untamed scraper for badges
- [ ] Task set that handles selecting optional tasks per level



---



# Completed

## General

- [x] Toggle parent view per parent
- [x] Toggle bank balance per child
- [x] Highlight self (when logged in as kid)
- [x] Logging "by User" for info
- [x] Go to page from Activity view
- [x] Clean up for iPad and iPhone usage
- [x] Profile pic - just emoji from keyboard (only for self, or if parent)
- [x] Family Activity should show kid's emoji
- [x] User emoji pop-up should allow background color selection
- [x] Don't let kid account zoom-in to other kid details
- [x] Quick ticket adjust (be a pop-up with recent reasons)
- [x] Banking
  - [x] Bank type (deposit/withdraw showsing as type???)
  - [x] Bank transfer - into own sub-accounts, but only main account for others; no selection for parent if parent isn't shown on dashboard
  - [x] Bank quick spend/deposit/transfer from dashboard
- [x] Right-justify the bank and ticket balance in the dashboard (so icons line up) - at least in table mode (not needed in card mode)
- [x] Chores today (seemed to change at 7pm, should be midnight local time)
- [x] Animate checked off task (or undone)
- [x] Kid overview/landing page
- [x] On Member page, list how how many tickets a kid can earn (or add a page that shows average coins that can be earned per kid with quick way to adjust tickets?)
- [x] Chore by day of week (select days to show; Sunday chores vs weekday)
- [x] /settings/users shows wrong number for tickets/day
- [x] On "Add Chore" add a checkbox to make a copy to all kids in the family



## Clean up

- [x] On kid's dashboard allow a sort by option (like on /display)?
- [x] Quick add:
  - [x] Better quick add/remove bank/tickets (FontAwesome?)
  - [x] Add a header for Add/Remove, Deposit/Withdraw/Transfer
  - [x] Under /tickets/X add a way to add/remove tickets
- [x] Under Family activity, allow "Undo" for chore rows
- [x] For each header, add the fontAwesome icon (as per the nav panel)
- [x] Rewards:
  - [x] Clean up Rewards vs Manage Rewards
  - [x] Confirm reward "Redeem" along with celebration animation
  - [x] Under rewards, each reward should have an average number of days to earn (avg tickets / day / kids)?
- [x] Test it on mobile
- [x] Activity (24 hours), or group by day of week?
- [x] Chores - select mode to delete or copy to other kid
- [x] Dark/system theme
- [x] Filter (today, yesterday, last 7 days, all)
  - [x] Activity
  - [x] Bank
  - [x] Tickets
- [x] Clean up pages 
  - [x] History w/ filters everywhere?
  - [x] Single chores list (chore-history, chores really the same)
- [x] On history page - all "just now" is that correct? - change to actual date/time?
- [x] On Dashboard (table layout) quick buttons to rounded
- [x] Auto-refresh the page? Info was stale this morning...
- [x] Log out icon
- [x] Login: dark/light mode select, also "Parent/Kid" font (purple) is too dark
- [x] Recent activity - summerize and truncate better
- [x] Banking -> Transfer to... Kid's name (not "checking")
- [x] Mobile review. Side panel vertical scroll wonky on smaller screens.
- [x] Large screen review: limit width beyond a certain screen size?
- [x] Settings:
  - [x] Rename bank accounts (defaults)
  - [x] Add "Settings" nav panel so parent can make selection of settings.
  - [x] Indicate which kid can self-check off tasks (or need to check them off and require permission, vs can't check it off, at all)
  - [x] Indicate which kid can self-complete a task set
  - [x] Use banking for the family?
  - [x] Use task sets for the family?
  - [x] Use tickets for the family?



## Task sets

- [x] Set name
- [x] Set type (badget, scavenger, etc)
- [x] Set tag (for filtering, like "Agriculture" for badges)
- [x] Steps
- [x] In Edit Task Set - the Tag, if present is unreadable in dark mode. let's lighten the font for tags in dark mode.
- [x] Allow parents to assign tasks to kids
- [x] Project vs Award. Project more like a chore that's assigned multiple times (like steps to completed a bigger project and can repeat) - and is more like one-and-done, not really to be seen again. Award is more like for displaying/showing-off.
- [x] Group by Category
- [x] Done set to "completed" area below
- [x] Done steps to "completed" area below (with animations like chores)
- [x] How to show on dashboard (circle progress?) - might require chores being circle progress around profile pic?
- [x] Add Task Set/Step completion as part of the Last Activity column (new filter type?) along with undo buttons
- [x] Graph - add steps from tasksets to the bar of chores completed that day
- [x] Sets:
  - [x] From within the award, also show who else is assigned
  - [x] Add celebration card after completed taskset (saying to go to trophey shelf)
  - [x] Add celebration card after completed project - saying good job and showing ticket payout, if any.
  - [x] Add celebration card after completed daily chores
  - [x] How long did it take to complete the task set?
  - [x] When "unassigning" the counter on the list doesn't change.
  - [x] Assign/unassign steps complete counter with warning when unassigning.
  - [x] Add ticket payouts to tasksets (add/edit dialog) then pay that out when the celebration card is displayed. If a step is undone then that payout should be reversed, though.
  - [x] Slow down glossy shine on badges...
  - [x] Add log/activity under Sets so we can see when assigned, when completed, etc per user.
  - [x] Allow parent to rearrange steps in a Set (drag & drop)
  - [x] How to display Sets on dashboard once they are completed? Keep them there until new Sets replace them? -> Keep them for the rest of the day, then reset/clear at end of day.
  - [x] What to do with a Project once it's done? Award goes to Trophey Shelf, but where does a project go?
  - [x] Add Trophies to Card and Table?