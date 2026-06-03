#!/bin/sh
cd "/home/diver/sources/JS/NSLorPanel/"
j=$(date)
git add .
git commit -m "Жесты, цепочки сообщений"
git push git@github.com:Vladgobelen/NSLorPanel.git
git add .
git commit -m "$1 $j"
git push

