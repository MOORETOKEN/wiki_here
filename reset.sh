if [ $1 == "full"]; then
	rm public/articles/*.md
fi
printf "{}" > cache.json
printf "{}" > revisions.json