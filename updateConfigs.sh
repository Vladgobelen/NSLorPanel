#!/bin/sh
cd "/home/diver/sources/JS/NSLorPanel/"
j=$(date)
git add .
git commit -m "Закрытие настроек по ESC. Сохранение скролла при показанных удаленных сообщениях и не только."
git push git@github.com:Vladgobelen/NSLorPanel.git
git add .
git commit -m "$1 $j"
git push

