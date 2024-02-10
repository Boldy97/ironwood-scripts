#!/bin/bash

git checkout main
git merge development
version=$(node.exe bump.js $1)
node.exe run.js
git add ../*
git commit -m "Version $version"
git tag "v$version"
git push
git push origin --tags
git checkout development
git merge main
git push

read -p "Press any key to resume ..."
