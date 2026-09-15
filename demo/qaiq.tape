# QAIQ demo — render with:  vhs demo/qaiq.tape
# Produces demo/qaiq.gif (swap Output to .mp4 for LinkedIn)

Output demo/qaiq.gif
Set FontSize 17
Set Width 1100
Set Height 760
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms
Set PlaybackSpeed 1.0

Sleep 700ms
Type "npx @rafaellabarrocas/qaiq ."
Sleep 400ms
Enter

# let the real scorecard render
Sleep 3s

# hold on the part that matters — the blind-spot block
Sleep 4s

# the closing line is the thesis; give it room
Sleep 3s
