#!/bin/sh
TEMP_DBNAME="amiei_tempdb"
ALBERT="/opt/albert"
output="score.txt"

# clear base
${ALBERT}/bin/albToolkit -b ${TEMP_DBNAME} clear_base -y 2>&1 > /dev/null

# import reference data
${ALBERT}/bin/albToolkit -b ${TEMP_DBNAME} import -f data/data.ref.xml > /dev/null

# deduplicate collect data
${ALBERT}/bin/albScript -f evaluate.js +b ${TEMP_DBNAME} +c data/data.col.xml +r data/rules.json > $output
grep score $output| awk '{split ($2, a, "\""); print "Score : " a[2]}'
grep 'duration"' $output| awk '{split ($2, a, "\""); print "Totalchrono : " a[2]}'
