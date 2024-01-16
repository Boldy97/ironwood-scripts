#!/bin/bash

version=$(node.exe bump.js $1)
node.exe run.js
git add ../*
git commit -m "Version $version"
git tag "v$version"
git push
git push origin --tags

read -p "Press any key to resume ..."
