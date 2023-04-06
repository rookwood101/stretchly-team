#!/bin/sh
rm ../server.zip && zip -r ../server.zip . -x 'node_modules/**' 'package-lock.json' 'node_modules/'
