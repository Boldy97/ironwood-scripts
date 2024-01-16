#!/bin/bash

version=$(node.exe bump.js $1)
git add *
git commit -m "Version $version"
git tag "v$version"
git push origin --tags
git push

read -p "Press any key to resume ..."
