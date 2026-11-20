#!/bin/bash
B=http://localhost:3000
L=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@dlc.ui.edu.ng","password":"demo1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
S=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"ada@dlc.ui.edu.ng","password":"demo1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
TEAM=$(curl -s -X POST $B/api/teams -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"courseCode":"CSC 201","courseTitle":"Data Structures"}')
echo "TEAM: $TEAM"
TID=$(echo "$TEAM" | python3 -c "import sys,json;print(json.load(sys.stdin)['team']['id'])")
CODE=$(echo "$TEAM" | python3 -c "import sys,json;print(json.load(sys.stdin)['team']['code'])")
echo "TID=$TID CODE=$CODE"
curl -s -X POST $B/api/teams/join -H "Authorization: Bearer $S" -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}"; echo
curl -s -X POST $B/api/teams/$TID/messages -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"text":"Hello team @Ada Demo — welcome to CSC 201 Data Structures. Please read chapter 3 before our group sync."}'; echo
curl -s -X POST $B/api/teams/$TID/messages -H "Authorization: Bearer $S" -H 'Content-Type: application/json' -d '{"text":"Thanks @Demo Lecturer! I will share my notes on linked lists here."}'; echo
T1=$(curl -s -X POST $B/api/teams/$TID/tasks -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"title":"Write summary of linked lists","assigneeMatric":"DLC/2024/001","deadline":"2026-11-20","priority":"High"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['task']['id'])")
T2=$(curl -s -X POST $B/api/teams/$TID/tasks -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"title":"Prepare slides on stacks and queues","assigneeMatric":"DLC/2024/001","deadline":"2026-11-21","priority":"Medium"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['task']['id'])")
T3=$(curl -s -X POST $B/api/teams/$TID/tasks -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"title":"Set up team chat and join codes","assigneeMatric":"DLC-STAFF-001","deadline":"2026-11-19","priority":"Medium"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['task']['id'])")
echo "TASKS: $T1 $T2 $T3"
curl -s -X PATCH $B/api/tasks/$T2 -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"status":"Doing"}'; echo
curl -s -X PATCH $B/api/tasks/$T3 -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"status":"Done"}'; echo
echo "chapter-3-notes" > /tmp/dlc-notes.txt
curl -s -X POST $B/api/teams/$TID/files -H "Authorization: Bearer $S" -F "file=@/tmp/dlc-notes.txt;filename=chapter-3-notes.txt"; echo
curl -s -X POST $B/api/teams/$TID/meetings -H "Authorization: Bearer $L" -H 'Content-Type: application/json' -d '{"title":"Group sync","dateTime":"2026-11-20T15:00","agenda":"Review chapter 3 and assign next tasks"}'; echo
echo "LECT_TOKEN=$L" > /tmp/dlc-tokens.txt
echo "STUD_TOKEN=$S" >> /tmp/dlc-tokens.txt
echo "TEAM_ID=$TID" >> /tmp/dlc-tokens.txt
curl -s $B/api/dashboard -H "Authorization: Bearer $L"; echo
curl -s $B/api/teams/$TID/contributions -H "Authorization: Bearer $L"; echo
